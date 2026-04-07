import { parseSections } from '../../parser/sections.js';
import type { Issue, StructuralRule } from '../../types.js';

const NEGATION_RE = /^[-*]\s+(don't|do not|never|avoid|not |no )/i;
const BULLET_RE = /^[-*]\s+/;

/** Minimum bullets in a section before the ratio check fires (avoids noise on tiny sections). */
const MIN_BULLETS = 4;
/** Fraction of negation bullets that triggers the warning. */
const NEGATION_THRESHOLD = 0.6;

/**
 * Flags sections where the majority of bullet instructions are negation-based
 * ("don't", "never", "avoid", "not", "no").
 *
 * Agents process positive instructions more reliably than negations.
 * "Write concise responses under 100 words" is clearer than "Don't write long responses".
 * Sections heavy in "don't do X" often hide the actual desired behaviour.
 */
export const negationHeavy: StructuralRule = (content: string, _filePath: string): Issue[] => {
  const sections = parseSections(content);
  const issues: Issue[] = [];

  for (const section of sections) {
    const bullets = section.content
      .split('\n')
      .filter((line) => BULLET_RE.test(line));

    if (bullets.length < MIN_BULLETS) continue;

    const negations = bullets.filter((line) => NEGATION_RE.test(line));
    const ratio = negations.length / bullets.length;

    if (ratio >= NEGATION_THRESHOLD) {
      issues.push({
        ruleId: 'negation-heavy',
        severity: 'suggestion',
        message: `Section "${section.heading}" has ${Math.round(ratio * 100)}% negation-based instructions (${negations.length}/${bullets.length} bullets)`,
        suggestion:
          'Rewrite "don\'t/never/avoid" rules as positive instructions — e.g. "Never write long responses" → "Keep responses under 100 words"',
        line: section.line,
        context: section.heading,
      });
    }
  }

  return issues;
};
