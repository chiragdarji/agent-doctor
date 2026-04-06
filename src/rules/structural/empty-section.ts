import { parseSections } from '../../parser/sections.js';
import type { Issue, StructuralRule } from '../../types.js';

/**
 * Flags headings that have no content below them.
 * Empty sections mislead agents into thinking guidance exists when it does not.
 */
export const emptySection: StructuralRule = (content: string, _filePath: string): Issue[] => {
  const sections = parseSections(content);
  const issues: Issue[] = [];

  for (const section of sections) {
    if (section.content.trim() === '') {
      issues.push({
        ruleId: 'empty-section',
        severity: 'suggestion',
        message: `Section "${section.heading}" has no content`,
        suggestion: `Add instructions under "${section.heading}" or remove the heading`,
        line: section.line,
        context: section.heading,
      });
    }
  }

  return issues;
};
