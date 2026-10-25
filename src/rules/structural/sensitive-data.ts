import type { Issue, StructuralRule } from '../../types.js';

const SECRET_PATTERNS: Array<{ re: RegExp; label: string }> = [
  // Anthropic API keys — hyphens are part of the key format (sk-ant-api03-…)
  { re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, label: 'Anthropic API key' },
  // OpenAI project keys (sk-proj-…)
  { re: /\bsk-proj-[A-Za-z0-9_-]{20,}/g, label: 'OpenAI project API key' },
  // Generic OpenAI / other sk- keys (no hyphens after prefix)
  { re: /\bsk-[A-Za-z0-9]{20,}/g, label: 'OpenAI API key' },
  // Generic secret assignments with real-looking values (not placeholders)
  { re: /\b(?:api[_-]?key|secret|password|passwd|token|access[_-]?key)\s*[=:]\s*["']?(?!<|YOUR|REPLACE|PLACEHOLDER|xxx|your)[A-Za-z0-9+/_-]{16,}/gi, label: 'Hardcoded credential' },
  // Bearer tokens in headers
  { re: /Bearer\s+[A-Za-z0-9_-]{20,}/g, label: 'Bearer token' },
  // Private key blocks
  { re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, label: 'Private key block' },
  // AWS access keys
  { re: /\bAKIA[A-Z0-9]{16}\b/g, label: 'AWS access key ID' },
  // GitHub personal access tokens (classic: ghp_; fine-grained: github_pat_)
  { re: /\bghp_[A-Za-z0-9]{20,}\b/g, label: 'GitHub personal access token' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g, label: 'GitHub fine-grained personal access token' },
  // Slack tokens (xoxb-, xoxp-, xoxa-, xoxr-, xoxs-)
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, label: 'Slack token' },
  // Google API keys
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/g, label: 'Google API key' },
  // Stripe live secret keys
  { re: /\bsk_live_[A-Za-z0-9]{24,}\b/g, label: 'Stripe secret key' },
];

/** Masks a secret: shows first 4 and last 4 chars with **** in the middle. */
function maskSecret(value: string): string {
  if (value.length <= 12) return '****';
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

/** Returns the line with the matched secret masked (never prints the real value). */
function redactContext(line: string, match: RegExpExecArray): string {
  const matched = match[0];
  const masked = maskSecret(matched);
  return line.replace(matched, masked).slice(0, 80);
}

/**
 * Returns true when text immediately surrounding the match (but not inside it)
 * contains a clear placeholder indicator like "example", "replace", "YOUR_", etc.
 * This avoids skipping entire lines that happen to contain the word "example"
 * anywhere, while still ignoring documented illustrative values.
 */
function isPlaceholderContext(line: string, match: RegExpExecArray): boolean {
  const matchStart = match.index ?? 0;
  const matchEnd = matchStart + match[0].length;
  // Look 50 chars before and after the match, but NOT inside it
  const before = line.slice(Math.max(0, matchStart - 50), matchStart);
  const after = line.slice(matchEnd, Math.min(line.length, matchEnd + 50));
  return /\b(example|e\.g\.|sample|replace|placeholder|your[-_ ]key|your[-_ ]api|<your|YOUR_|REDACTED|\[REDACTED\])\b/i.test(
    before + after,
  );
}

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

    // Secrets in code blocks are just as dangerous when committed — still flag them

    for (const { re, label } of SECRET_PATTERNS) {
      re.lastIndex = 0;
      const match = re.exec(line);
      if (!match) continue;

      if (isPlaceholderContext(line, match)) continue;

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
        context: redactContext(line.trim(), match),
      });
    }
  }

  return issues;
};
