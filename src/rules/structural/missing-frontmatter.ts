import type { Issue, StructuralRule } from '../../types.js';

/**
 * Checks that .mdc files have a YAML frontmatter block.
 * Without frontmatter, Cursor may silently ignore the rule file.
 */
export const missingFrontmatter: StructuralRule = (content: string, filePath: string): Issue[] => {
  if (!filePath.endsWith('.mdc')) return [];
  if (content.trimStart().startsWith('---')) return [];

  return [
    {
      ruleId: 'missing-frontmatter',
      severity: 'warning',
      message: '.mdc file is missing a YAML frontmatter block',
      suggestion: 'Add a frontmatter block at the top of the file:\n---\nalwaysApply: true\n---',
    },
  ];
};
