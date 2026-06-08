import type { Issue, StructuralRule } from '../../types.js';

/**
 * Patterns that match real credentials/secrets — not example placeholders.
 * Each entry: [regex, label, skip-if-placeholder-nearby]
 */
const SECRET_PATTERNS: Array<{ re: RegExp; label: string }> = [
  // API key prefixes used by major providers
  { re: /\bsk-[A-Za-z0-9]{20,}/g, label: 'OpenAI/Anthropic API key (sk-...)' },
  { re: /\bANTHROPIC_API_KEY\s*=\s*["']?sk-ant-[A-Za-z0-9\-_]{20,}/g, label: 'Anthropic API key assignment' },
  // Generic secret assignments with real-looking values (not placeholders)
  { re: /\b(?:api[_-]?key|secret|password|passwd|token|access[_-]?key)\s*[=:]\s*["']?(?!<|YOUR|REPLACE|PLACEHOLDER|xxx|your)[A-Za-z0-9+/\-_]{16,}/gi, label: 'Hardcoded credential' },
  // Bearer tokens in headers
  { re: /Bearer\s+[A-Za-z0-9\-_]{20,}/g, label: 'Bearer token' },
  // Private key blocks
  { re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, label: 'Private key block' },
  // AWS access keys
  { re: /\bAKIA[A-Z0-9]{16}\b/g, label: 'AWS access key ID' },
  // GitHub personal access tokens
  { re: /\bghp_[A-Za-z0-9]{20,}\b/g, label: 'GitHub personal access token' },
];

/** Lines that are clearly illustrative — skip them. */
const EXAMPLE_LINE_RE = /\b(example|e\.g\.|sample|placeholder|replace|your[-_ ]|<your|YOUR_|REDACTED|\[REDACTED\])\b/i;

/**
 * Detects hardcoded secrets, API keys, tokens, or private key blocks in instruction files.
 *
 * Instruction files are often shared, committed to version control, or passed to LLMs.
 * A leaked key in CLAUDE.md or AGENTS.md is immediately exposed to every LLM call.
 */
export const sensitiveData: StructuralRule = (content: string, _filePath: string): Issue[] => {
  const lines = content.split('\n');
  const issues: Issue[] = [];
  let inCodeBlock = false;
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (/^```|^~~~/.test(line.trim())) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    // Still flag code blocks — secrets in code blocks are just as dangerous
    if (EXAMPLE_LINE_RE.test(line)) continue;

    for (const { re, label } of SECRET_PATTERNS) {
      re.lastIndex = 0;
      const match = re.exec(line);
      if (!match) continue;

      const dedupeKey = `${label}:${i}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      issues.push({
        ruleId: 'sensitive-data',
        severity: 'critical',
        message: `Possible ${label} found in instruction file`,
        suggestion:
          'Remove the credential and replace with an environment variable reference (e.g. $API_KEY) or a placeholder like [REDACTED]',
        line: i + 1,
        context: line.trim().slice(0, 80),
      });
    }
  }

  return issues;
};
