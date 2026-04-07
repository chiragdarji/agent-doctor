import { readFileSync, writeFileSync } from 'node:fs';
import type { Issue, RuleId } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
]);

// Matches every TODO-family marker agent-doctor flags
const TODO_RE = /\b(TODO|FIXME|HACK|PLACEHOLDER|XXX|TBD)\b/;

// ---------------------------------------------------------------------------
// applyFixes
// ---------------------------------------------------------------------------

/**
 * Applies auto-fixes for structural issues to the given file.
 *
 * Fixed rules:
 *   - `todo-in-instructions`  → replaces offending line with an HTML comment
 *   - `unclosed-code-block`   → appends closing ``` fence at end of file
 *   - `empty-section`         → inserts a placeholder line after the heading
 *
 * Non-fixable rules are reported in `skipped`.
 * `legacy-format` is always skipped — the file rename must be done manually.
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

  // Categorise every issue upfront
  for (const issue of issues) {
    if (!AUTO_FIXABLE.has(issue.ruleId)) {
      skippedSet.add(issue.ruleId);
    }
  }

  // ── todo-in-instructions ─────────────────────────────────────────────────
  const hasTodo = issues.some((i) => i.ruleId === 'todo-in-instructions');
  if (hasTodo) {
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
  const hasUnclosed = issues.some((i) => i.ruleId === 'unclosed-code-block');
  if (hasUnclosed) {
    if (!content.endsWith('\n')) content += '\n';
    content += '```\n';
    fixedSet.add('unclosed-code-block');
  }

  // ── empty-section ─────────────────────────────────────────────────────────
  // Insert a placeholder line after each flagged heading.
  // Process in reverse line-number order so earlier insertions don't shift
  // the line numbers of later ones.
  const emptyIssues = issues.filter(
    (i): i is Issue & { line: number } => i.ruleId === 'empty-section' && i.line !== undefined,
  );
  if (emptyIssues.length > 0) {
    const lines = content.split('\n');
    const sortedDesc = [...emptyIssues].sort((a, b) => b.line - a.line);
    for (const issue of sortedDesc) {
      const idx = issue.line - 1; // 1-based → 0-based
      lines.splice(idx + 1, 0, '', '_No content yet — add instructions here._');
    }
    content = lines.join('\n');
    fixedSet.add('empty-section');
  }

  // ── write or preview ─────────────────────────────────────────────────────
  if (!dryRun && content !== original) {
    writeFileSync(filePath, content, 'utf8');
  }

  return {
    fixed: [...fixedSet],
    skipped: [...skippedSet],
    ...(dryRun ? { preview: content } : {}),
  };
}
