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

/**
 * Flags .mdc files where `alwaysApply: true` and `globs` are both set.
 *
 * When `alwaysApply` is true the rule is injected into every agent context —
 * the `globs` field is completely ignored by Cursor. Having both set implies
 * the author intended glob-scoped activation, which will never happen.
 */
export const conflictingFrontmatter: StructuralRule = (
  content: string,
  filePath: string,
): Issue[] => {
  if (!filePath.endsWith('.mdc')) return [];

  const fm = getFrontmatter(content);

  if (fm['alwaysApply'] === true && hasGlobs(fm)) {
    return [
      {
        ruleId: 'conflicting-frontmatter',
        severity: 'warning',
        message: '`alwaysApply: true` and `globs` are both set — `globs` has no effect',
        suggestion:
          'Remove `globs` (rule already applies everywhere) or set `alwaysApply: false` to enable glob-scoped activation',
      },
    ];
  }

  return [];
};
