import { parseSections } from '../../parser/sections.js';
import type { Issue, StructuralRule } from '../../types.js';

/**
 * Language that establishes an agent identity or role.
 * Matches "you are", "your role is", "act as", "you will act as", etc.
 */
const PERSONA_RE =
  /\b(you are (a |an |the )?[a-z]|your role (is|:)|act as (a |an |the )?[a-z]|you will (act|serve|function) as|you('re| are) responsible for|your (primary |main |core )?(responsibility|purpose|goal|task) is)\b/i;

/**
 * Headings that typically contain persona/identity content.
 */
const PERSONA_HEADING_RE = /\b(role|persona|identity|you are|about you|agent|assistant|overview)\b/i;

/**
 * Files shorter than this token count are likely small helper rules, not full agent
 * instruction files — skip the persona check to avoid noise.
 */
const MIN_TOKEN_THRESHOLD = 80;

/**
 * Flags instruction files that contain no agent identity or role definition.
 *
 * Without a clear persona, agents default to generic behaviour and may ignore
 * file-specific constraints. A brief "You are a..." statement anchors all
 * subsequent instructions to a defined role.
 *
 * Skipped for short files (< 80 tokens) which are typically single-purpose rule snippets.
 */
export const missingAgentPersona: StructuralRule = (content: string, _filePath: string): Issue[] => {
  // Rough token estimate: ~4 chars per token
  if (content.length / 4 < MIN_TOKEN_THRESHOLD) return [];

  // If the content itself contains persona language anywhere, we're fine
  if (PERSONA_RE.test(content)) return [];

  // Or if any section heading suggests a persona/role section exists
  const sections = parseSections(content);
  if (sections.some((s) => PERSONA_HEADING_RE.test(s.heading))) return [];

  return [
    {
      ruleId: 'missing-agent-persona',
      severity: 'warning',
      message: 'No agent persona or role definition found in this instruction file',
      suggestion:
        'Add a brief role statement near the top, e.g. "You are a senior TypeScript engineer..." to anchor agent behaviour',
      line: 1,
    },
  ];
};
