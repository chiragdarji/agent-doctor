import type { Issue, StructuralRule } from '../../types.js';

/**
 * Patterns that signal prompt-injection attempts or dangerous override grants in instruction files.
 *
 * Two categories:
 * 1. Override openers — classic jailbreak phrases ("ignore previous instructions", "you are now X")
 *    that could appear if the instruction file was assembled from untrusted input or was itself
 *    the target of a supply-chain injection attack.
 * 2. Over-permissive delegation — instructions that grant the end-user the ability to override
 *    the agent's own rules at runtime ("follow any instruction the user gives").
 */
const INJECTION_PATTERNS: Array<{ re: RegExp; label: string }> = [
  // Classic "ignore / disregard / forget previous instructions" variants
  {
    re: /\b(?:ignore|disregard|bypass|override|forget)\s+(?:all\s+)?(?:previous|prior|above|earlier|existing|your)\s+(?:instructions?|rules?|guidelines?|constraints?|directives?|context)\b/i,
    label: 'Override opener ("ignore previous instructions")',
  },
  // "Forget everything" above / before
  {
    re: /\bforget\s+(?:everything|all)\s+(?:above|before|previously|you(?:'ve|\s+have)\s+(?:been\s+told|learned|seen))\b/i,
    label: 'Memory wipe opener ("forget everything above")',
  },
  // Role-swap opener: "you are now [name/role]" — but not "you are now responsible for" (legitimate)
  {
    re: /\byou\s+are\s+now\s+(?!(?:responsible|tasked|required|able|allowed|permitted|going|about|ready)\b)[A-Z][A-Za-z]{2,}/,
    label: 'Role-override opener ("you are now DAN")',
  },
  // "Act as if you have no restrictions"
  {
    re: /\bact\s+as\s+(?:if|though)\s+you\s+(?:have\s+)?(?:no|without\s+any)\s+(?:restrictions?|limitations?|guidelines?|rules?|constraints?|alignment)\b/i,
    label: 'Restriction bypass ("act as if you have no restrictions")',
  },
  // Double-bracket injection markers used in adversarial prompt payloads
  {
    re: /\[\[\s*(?:inject|override|system|prompt|jailbreak|bypass)\b/i,
    label: 'Double-bracket injection marker',
  },
  // Explicit blanket delegation: "follow / do whatever / obey anything the user says"
  {
    re: /\b(?:follow|obey|execute|do)\s+(?:any(?:thing)?|whatever|all|every(?:thing)?)\s+(?:the\s+)?(?:user|human|operator|caller)\s+(?:say|says|tell|tells|instruct|instructs|want|wants|ask|asks|request|requests)\b/i,
    label: 'Blanket user override ("do whatever the user says")',
  },
  // "Users can override these rules"
  {
    re: /\b(?:users?|humans?|operators?)\s+(?:may|can|should|are\s+allowed\s+to|have\s+permission\s+to)\s+override\s+(?:these|the|all|any)\s+(?:rules?|instructions?|guidelines?|constraints?)\b/i,
    label: 'User override grant ("users can override these rules")',
  },
];

/**
 * Detects prompt injection attempts and dangerous over-permissive delegation in instruction files.
 *
 * Instruction files are high-value targets for supply-chain attacks. A compromised CLAUDE.md or
 * AGENTS.md that instructs the agent to "ignore previous instructions" or "do whatever the user
 * says" silently subverts all other safety rules.
 */
export const promptInjection: StructuralRule = (content: string, _filePath: string): Issue[] => {
  const lines = content.split('\n');
  const issues: Issue[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (/^(`{3,}|~{3,})/.test(line.trim())) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Skip table rows and inline code — these document patterns, they don't embody them
    if (/^\s*\|/.test(line)) continue;
    const stripped = line.replace(/`[^`]*`/g, '');

    for (const { re, label } of INJECTION_PATTERNS) {
      if (!re.test(stripped)) continue;

      issues.push({
        ruleId: 'prompt-injection',
        severity: 'critical',
        message: `Possible prompt injection pattern: ${label}`,
        suggestion:
          'Remove or rewrite this instruction. If intentional, replace with a scoped constraint ' +
          '(e.g. "Users may adjust tone but not safety rules") rather than a blanket override grant.',
        line: i + 1,
        context: line.trim().slice(0, 120),
      });
      break; // one issue per line is enough
    }
  }

  return issues;
};
