import { basename } from 'node:path';
import type { Issue, StructuralRule } from '../../types.js';

const HANDOFF_RE =
  /\b(escalat|hand.?off|delegat|transfer\s+to|when\s+to\s+(stop|ask|escalate|involve)|out.of.scope|cannot\s+(help|assist|do)|not\s+responsible|beyond\s+(my|this)\s+(scope|capabilit))/i;

const HEADING_HANDOFF_RE =
  /\b(escalat|handoff|hand.off|delegat|limitation|scope|when\s+to|transfer|fallback)/i;

/**
 * Detects AGENTS.md files that have no handoff or escalation protocol.
 *
 * In multi-agent systems, every agent must know when it is out of its depth and
 * how to pass control to another agent or a human. Without this, agents either
 * attempt tasks they cannot complete or silently fail without escalating.
 *
 * Only fires for files named AGENTS.md (case-insensitive).
 */
export const missingHandoffProtocol: StructuralRule = (
  content: string,
  filePath: string,
): Issue[] => {
  const fileName = basename(filePath).toLowerCase();
  if (fileName !== 'agents.md') return [];

  // Consider the rule satisfied if any heading or sentence references handoff/escalation
  const lines = content.split('\n');
  for (const line of lines) {
    if (HEADING_HANDOFF_RE.test(line) || HANDOFF_RE.test(line)) {
      return [];
    }
  }

  return [
    {
      ruleId: 'missing-handoff-protocol',
      severity: 'warning',
      message: 'AGENTS.md has no handoff or escalation protocol',
      suggestion:
        'Add a section (e.g. "## When to Escalate") describing what is out of scope and how to ' +
        'transfer control to another agent or a human operator.',
    },
  ];
};
