import { basename } from 'node:path';
import type { Issue, StructuralRule } from '../../types.js';

// Positive scope signals — agent says what it handles
const SCOPE_POSITIVE_RE =
  /\b(responsible\s+for|handles?|manages?|this\s+agent\s+(is|will|can|does)|my\s+role\s+is|scope[:\s]|you\s+are\s+(?:an?\s+)?\w+\s+(?:agent|assistant|bot))\b/i;

// Boundary signals — agent says what it does NOT handle
const SCOPE_BOUNDARY_RE =
  /\b(does\s+not\s+(handle|include|cover)|out\s+of\s+scope|not\s+(responsible|designed)\s+for|limited\s+to|only\s+(?:handles?|manages?)|(?:will|should|must)\s+not\s+(?:handle|attempt|perform))\b/i;

const HEADING_SCOPE_RE =
  /\b(overview|scope|responsibilities|role|purpose|description|about\s+this|what\s+(this|i)\s+(agent|do)|capabilities)\b/i;

/**
 * Detects AGENTS.md files that have no explicit scope or boundary definition.
 *
 * An agent without a defined scope will attempt to handle everything it encounters.
 * In multi-agent architectures this causes overlap, conflict, and unpredictable
 * delegation chains. The scope section is the single most important part of AGENTS.md.
 *
 * Only fires for files named AGENTS.md (case-insensitive).
 */
export const missingAgentScope: StructuralRule = (
  content: string,
  filePath: string,
): Issue[] => {
  const fileName = basename(filePath).toLowerCase();
  if (fileName !== 'agents.md') return [];

  const lines = content.split('\n');

  for (const line of lines) {
    if (
      HEADING_SCOPE_RE.test(line) ||
      SCOPE_POSITIVE_RE.test(line) ||
      SCOPE_BOUNDARY_RE.test(line)
    ) {
      return [];
    }
  }

  return [
    {
      ruleId: 'missing-agent-scope',
      severity: 'warning',
      message: 'AGENTS.md has no defined scope or responsibility boundary',
      suggestion:
        'Add a scope section near the top (e.g. "## Scope") that describes what this agent ' +
        'is responsible for AND what it explicitly does not handle. ' +
        'Example: "Handles code review and CI triage. Does not deploy to production."',
    },
  ];
};
