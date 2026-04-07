import { load as yamlLoad } from 'js-yaml';
import type { Issue, StructuralRule } from '../../types.js';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

function getFrontmatter(content: string): Record<string, unknown> {
  const match = FRONTMATTER_RE.exec(content);
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
 * Flags .mdc files that have no `description` field in their frontmatter.
 *
 * When `alwaysApply: false`, Cursor relies on the description to decide
 * whether to activate the rule for a given task. Without it, the rule
 * is activated only by glob matching — or not at all.
 */
export const missingDescription: StructuralRule = (content: string, filePath: string): Issue[] => {
  if (!filePath.endsWith('.mdc')) return [];

  const fm = getFrontmatter(content);
  const description = fm['description'];
  const hasDescription =
    typeof description === 'string' && description.trim().length > 0;

  if (hasDescription) return [];

  return [
    {
      ruleId: 'missing-description',
      severity: 'warning',
      message: 'No `description` field in frontmatter — Cursor cannot match this rule contextually',
      suggestion:
        'Add a concise `description:` to the YAML frontmatter explaining when this rule applies',
    },
  ];
};
