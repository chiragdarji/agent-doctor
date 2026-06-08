import { readFileSync, writeFileSync } from 'node:fs';
import type { Issue, RuleId } from './types.js';

export interface FixResult {
  /** Rule IDs that were successfully auto-fixed. */
  fixed: RuleId[];
  /** Rule IDs present in issues but with no auto-fix available. */
  skipped: RuleId[];
  /**
   * Full updated file content (only populated in dry-run mode).
   * Allows callers to preview changes before writing.
   */
  preview?: string;
}

// Rules that can be fixed automatically by rewriting the file content.
// `legacy-format` intentionally excluded — renaming files is destructive and must be manual.
const AUTO_FIXABLE: ReadonlySet<RuleId> = new Set<RuleId>([
  'todo-in-instructions',
  'unclosed-code-block',
  'empty-section',
  'missing-success-criteria',
  'sensitive-data',
  'missing-agent-persona',
  'hardcoded-environment',
]);

const TODO_RE = /\b(TODO|FIXME|HACK|PLACEHOLDER|XXX|TBD)\b/;

// Credential patterns used for redaction (mirrors sensitive-data rule)
const REDACT_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9]{20,}/g,
  /Bearer\s+[A-Za-z0-9\-_]{20,}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\bAKIA[A-Z0-9]{16}\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /\b(?:api[_-]?key|secret|password|passwd|token|access[_-]?key)\s*[=:]\s*["']?(?!<|YOUR|REPLACE|PLACEHOLDER|xxx|your)[A-Za-z0-9+/\-_]{16,}/gi,
];

// Env-path replacement patterns (mirrors hardcoded-environment rule)
const UNIX_PATH_FIX_RE = /(?<![`'"/\w])(\/(?:home|usr|etc|var|root|opt|srv|tmp|proc|sys)\/\S+)/g;
const WIN_PATH_FIX_RE = /\b([A-Z]:\\[\w\\.\- ]+)/g;
const LOCALHOST_FIX_RE = /\blocalhost:(\d{2,5})\b/g;

/**
 * Applies auto-fixes for structural issues to the given file.
 *
 * Fixed rules:
 *   - `todo-in-instructions`      → replaces offending line with an HTML comment
 *   - `unclosed-code-block`       → appends closing fence at end of file
 *   - `empty-section`             → inserts a placeholder line after the heading
 *   - `missing-success-criteria`  → appends a success-criteria blockquote at end of section
 *   - `sensitive-data`            → redacts matched credentials with [REDACTED]
 *   - `missing-agent-persona`     → prepends a persona stub at the top of the file
 *   - `hardcoded-environment`     → replaces absolute paths with env-var placeholders
 *
 * Non-fixable rules are reported in `skipped`.
 *
 * @param filePath - absolute path to the instruction file
 * @param issues   - issues array from structural/semantic analysis
 * @param options  - `dryRun: true` returns preview content without writing
 */
export async function applyFixes(
  filePath: string,
  issues: Issue[],
  options?: { dryRun?: boolean },
): Promise<FixResult> {
  const dryRun = options?.dryRun ?? false;
  const fixedSet = new Set<RuleId>();
  const skippedSet = new Set<RuleId>();

  let content = readFileSync(filePath, 'utf8');
  const original = content;

  for (const issue of issues) {
    if (!AUTO_FIXABLE.has(issue.ruleId)) {
      skippedSet.add(issue.ruleId);
    }
  }

  // ── todo-in-instructions ──────────────────────────────────────────────────
  if (issues.some((i) => i.ruleId === 'todo-in-instructions')) {
    const lines = content.split('\n');
    let changed = false;
    const cleaned = lines.map((line) => {
      if (TODO_RE.test(line)) {
        changed = true;
        return `<!-- TODO removed by agent-doctor — replace with actual instruction -->`;
      }
      return line;
    });
    if (changed) {
      content = cleaned.join('\n');
      fixedSet.add('todo-in-instructions');
    }
  }

  // ── unclosed-code-block ───────────────────────────────────────────────────
  if (issues.some((i) => i.ruleId === 'unclosed-code-block')) {
    if (!content.endsWith('\n')) content += '\n';
    content += '```\n';
    fixedSet.add('unclosed-code-block');
  }

  // ── empty-section ─────────────────────────────────────────────────────────
  // Process in reverse so earlier insertions don't shift later line numbers.
  const emptyIssues = issues.filter(
    (i): i is Issue & { line: number } => i.ruleId === 'empty-section' && i.line !== undefined,
  );
  if (emptyIssues.length > 0) {
    const lines = content.split('\n');
    for (const issue of [...emptyIssues].sort((a, b) => b.line - a.line)) {
      lines.splice(issue.line - 1 + 1, 0, '', '_No content yet — add instructions here._');
    }
    content = lines.join('\n');
    fixedSet.add('empty-section');
  }

  // ── missing-success-criteria ──────────────────────────────────────────────
  const successIssues = issues.filter(
    (i): i is Issue & { line: number } =>
      i.ruleId === 'missing-success-criteria' && i.line !== undefined,
  );
  if (successIssues.length > 0) {
    const lines = content.split('\n');
    const HEADING_RE = /^#{1,6}\s/;
    const PLACEHOLDER =
      '> ✅ **Success criteria:** Done when _<describe the expected outcome — e.g. "all tests pass", "the feature works as expected">_';
    for (const issue of [...successIssues].sort((a, b) => b.line - a.line)) {
      let insertIdx = lines.length;
      for (let i = issue.line; i < lines.length; i++) {
        if (HEADING_RE.test(lines[i] ?? '')) {
          insertIdx = i;
          break;
        }
      }
      lines.splice(insertIdx, 0, '', PLACEHOLDER, '');
    }
    content = lines.join('\n');
    fixedSet.add('missing-success-criteria');
  }

  // ── sensitive-data ────────────────────────────────────────────────────────
  if (issues.some((i) => i.ruleId === 'sensitive-data')) {
    let redacted = content;
    for (const re of REDACT_PATTERNS) {
      re.lastIndex = 0;
      redacted = redacted.replace(re, (match) => {
        // For key=value patterns, preserve the key and redact only the value
        const eqIdx = match.search(/[=:]\s*["']?/);
        if (eqIdx > 0) return `${match.slice(0, eqIdx + 1)} [REDACTED]`;
        return '[REDACTED]';
      });
    }
    if (redacted !== content) {
      content = redacted;
      fixedSet.add('sensitive-data');
    }
  }

  // ── missing-agent-persona ─────────────────────────────────────────────────
  if (issues.some((i) => i.ruleId === 'missing-agent-persona')) {
    const PERSONA_STUB =
      '<!-- agent-doctor: update this persona statement -->\n' +
      'You are a helpful AI assistant. Describe your specific role, expertise, and constraints here.\n\n';
    const fmMatch = /^---\n[\s\S]*?\n---\n/.exec(content);
    if (fmMatch) {
      const after = fmMatch.index + fmMatch[0].length;
      content = content.slice(0, after) + PERSONA_STUB + content.slice(after);
    } else {
      content = PERSONA_STUB + content;
    }
    fixedSet.add('missing-agent-persona');
  }

  // ── hardcoded-environment ─────────────────────────────────────────────────
  if (issues.some((i) => i.ruleId === 'hardcoded-environment')) {
    let fixed = content;
    fixed = fixed.replace(UNIX_PATH_FIX_RE, (_, p: string) =>
      p.startsWith('/home/') ? p.replace(/^\/home\/[^/]+/, '$HOME') : p.replace(/^\/[^/]+\/[^/]+/, '${PROJECT_ROOT}'),
    );
    fixed = fixed.replace(WIN_PATH_FIX_RE, '%PROJECT_ROOT%\\');
    fixed = fixed.replace(LOCALHOST_FIX_RE, 'localhost:$PORT');
    if (fixed !== content) {
      content = fixed;
      fixedSet.add('hardcoded-environment');
    }
  }

  // ── write or preview ──────────────────────────────────────────────────────
  if (!dryRun && content !== original) {
    writeFileSync(filePath, content, 'utf8');
  }

  return {
    fixed: [...fixedSet],
    skipped: [...skippedSet],
    ...(dryRun ? { preview: content } : {}),
  };
}
