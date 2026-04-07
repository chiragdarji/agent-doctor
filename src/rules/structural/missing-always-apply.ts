import { load as yamlLoad } from 'js-yaml';
import type { Issue, StructuralRule } from '../../types.js';

/** Extracts YAML frontmatter from raw content without using eval(). */
function extractFrontmatter(content: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match || match[1] === undefined) return {};
  try {
    const parsed = yamlLoad(match[1]);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Checks that .mdc files have `alwaysApply: true` in their frontmatter.
 * Without this flag, Cursor agent mode silently ignores the rule.
 */
export const missingAlwaysApply: StructuralRule = (content: string, filePath: string): Issue[] => {
  if (!filePath.endsWith('.mdc')) return [];

  const frontmatter = extractFrontmatter(content);

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
