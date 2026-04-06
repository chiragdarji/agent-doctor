import matter from 'gray-matter';
import type { Issue, StructuralRule } from '../../types.js';

/**
 * Checks that .mdc files have `alwaysApply: true` in their frontmatter.
 * Without this flag, Cursor agent mode silently ignores the rule.
 */
export const missingAlwaysApply: StructuralRule = (content: string, filePath: string): Issue[] => {
  if (!filePath.endsWith('.mdc')) return [];

  let frontmatter: Record<string, unknown> = {};
  try {
    const { data } = matter(content);
    frontmatter = data as Record<string, unknown>;
  } catch {
    return [];
  }

  if (frontmatter['alwaysApply'] === true) return [];

  return [
    {
      ruleId: 'missing-always-apply',
      severity: 'warning',
      message: '`alwaysApply` is not set to `true` — Cursor agent mode may silently ignore this rule',
      suggestion: 'Add `alwaysApply: true` to the YAML frontmatter block',
    },
  ];
};
