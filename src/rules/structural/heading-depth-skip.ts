import type { Issue, StructuralRule } from '../../types.js';

/**
 * Flags heading level jumps greater than one (e.g. ## → ####).
 *
 * Skipping levels breaks the implied document hierarchy. Agents that parse
 * heading depth to infer scope boundaries will misread which section owns
 * a block of instructions.
 *
 * Note: jumping back up (#### → ##) is always valid.
 */
export const headingDepthSkip: StructuralRule = (content: string, _filePath: string): Issue[] => {
  const lines = content.split('\n');
  const issues: Issue[] = [];
  let prevLevel = 0;
  let prevHeading = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) continue;

    const level = match[1]!.length;
    const heading = match[2]!.trim();

    if (prevLevel > 0 && level > prevLevel + 1) {
      issues.push({
        ruleId: 'heading-depth-skip',
        severity: 'suggestion',
        message: `Heading level jumps from ${'#'.repeat(prevLevel)} to ${'#'.repeat(level)} — skips ${level - prevLevel - 1} level(s)`,
        suggestion: `Use ${'#'.repeat(prevLevel + 1)} "${heading}" to maintain hierarchy, or restructure the section under "${prevHeading}"`,
        line: i + 1,
        context: heading,
        relatedLine: i, // previous heading line (approximate)
      });
    }

    prevLevel = level;
    prevHeading = heading;
  }

  return issues;
};
