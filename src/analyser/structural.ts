import {
  missingFrontmatter,
  missingAlwaysApply,
  legacyFormat,
  createTokenBudgetRule,
  emptySection,
} from '../rules/structural/index.js';
import type { Config, Issue, ParsedFile, StructuralRule } from '../types.js';

/**
 * Runs all structural rules against a parsed file and returns matching issues.
 * Rules disabled via `config.rules[ruleId] === 'off'` are filtered out.
 */
export function runStructuralAnalysis(parsed: ParsedFile, config: Config): Issue[] {
  const rules: StructuralRule[] = [
    missingFrontmatter,
    missingAlwaysApply,
    legacyFormat,
    createTokenBudgetRule(config.tokenBudgetWarning),
    emptySection,
  ];

  // Pass rawContent so frontmatter-aware rules (missing-frontmatter, missing-always-apply)
  // can inspect the full file, while section-based rules parse from the raw text safely
  // (frontmatter lines don't match the heading regex so they're treated as preamble).
  return rules
    .flatMap((rule) => rule(parsed.rawContent, parsed.filePath))
    .filter((issue) => config.rules[issue.ruleId] !== 'off');
}
