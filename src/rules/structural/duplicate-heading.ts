import type { Issue, StructuralRule } from '../../types.js';

/**
 * Flags headings that appear more than once in the file (case-insensitive).
 * Duplicate headings confuse agents — they can't determine which section's
 * instructions take precedence when both match the same topic.
 */
export const duplicateHeading: StructuralRule = (content: string, _filePath: string): Issue[] => {
  const lines = content.split('\n');
  const seen = new Map<string, number>(); // normalised heading → first line number
  const issues: Issue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) continue;

    const heading = match[2]!.trim();
    const key = heading.toLowerCase();
    const firstLine = seen.get(key);

    if (firstLine !== undefined) {
      issues.push({
        ruleId: 'duplicate-heading',
        severity: 'warning',
        message: `Heading "${heading}" appears more than once`,
        suggestion: `Rename or merge the duplicate sections — agents cannot determine which copy takes precedence`,
        line: i + 1,
        context: heading,
        relatedLine: firstLine,
      });
    } else {
      seen.set(key, i + 1);
    }
  }

  return issues;
};
