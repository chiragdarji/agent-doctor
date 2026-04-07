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

function hasGlobs(fm: Record<string, unknown>): boolean {
  const globs = fm['globs'];
  if (typeof globs === 'string') return globs.trim().length > 0;
  if (Array.isArray(globs)) return globs.length > 0;
  return false;
}

function hasDescription(fm: Record<string, unknown>): boolean {
  const desc = fm['description'];
  return typeof desc === 'string' && desc.trim().length > 0;
}

/**
 * Flags .mdc files where `alwaysApply` is false (or not set) and no `globs`
 * pattern is defined.
 *
 * Without `alwaysApply: true` or a `globs` pattern, Cursor activates the rule
 * only through description-based semantic matching — which is unreliable for
 * precise file-type targeting. If the rule is file-type specific, add globs.
 */
export const missingFileGlob: StructuralRule = (content: string, filePath: string): Issue[] => {
  if (!filePath.endsWith('.mdc')) return [];

  const fm = getFrontmatter(content);

  // Only applies when the rule is NOT already always-active
  if (fm['alwaysApply'] === true) return [];

  // If globs are set, no problem
  if (hasGlobs(fm)) return [];

  // If there's a clear description, suggestion-level only (semantic matching may be intentional)
  const severity = hasDescription(fm) ? 'suggestion' : 'warning';

  return [
    {
      ruleId: 'missing-file-glob',
      severity,
      message:
        '`alwaysApply` is false and no `globs` pattern is set — rule may never activate',
      suggestion:
        'Add a `globs:` pattern (e.g. `**/*.ts`) or set `alwaysApply: true` to guarantee activation',
    },
  ];
};
