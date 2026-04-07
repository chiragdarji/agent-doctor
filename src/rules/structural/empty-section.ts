import { parseSections } from '../../parser/sections.js';
import type { Issue, StructuralRule } from '../../types.js';

/**
 * Flags headings that have no content below them and no child sub-sections.
 * A section that acts as a container for sub-headings (e.g. ## Rule 1 → #### Sub rule 1.1)
 * is intentional grouping and must not be flagged.
 */
export const emptySection: StructuralRule = (content: string, _filePath: string): Issue[] => {
  const sections = parseSections(content);
  const issues: Issue[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    if (section.content.trim() !== '') continue;

    // Skip container sections — next section is a deeper heading (child of this one)
    const next = sections[i + 1];
    if (next !== undefined && next.level > section.level) continue;

    issues.push({
      ruleId: 'empty-section',
      severity: 'suggestion',
      message: `Section "${section.heading}" has no content`,
      suggestion: `Add instructions under "${section.heading}" or remove the heading`,
      line: section.line,
      context: section.heading,
    });
  }

  return issues;
};
