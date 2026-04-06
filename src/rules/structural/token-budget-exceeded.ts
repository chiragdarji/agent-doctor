import { parseSections } from '../../parser/sections.js';
import type { Issue, StructuralRule } from '../../types.js';

/**
 * Returns a structural rule that flags any section exceeding the token budget.
 * Large sections degrade agent context quality and inflate costs.
 *
 * @param threshold - Maximum tokens allowed per section (default: 500)
 */
export function createTokenBudgetRule(threshold: number): StructuralRule {
  return (content: string, _filePath: string): Issue[] => {
    const sections = parseSections(content);
    const issues: Issue[] = [];

    for (const section of sections) {
      if (section.tokenCount > threshold) {
        issues.push({
          ruleId: 'token-budget-exceeded',
          severity: 'warning',
          message: `Section "${section.heading}" is ${section.tokenCount} tokens (limit: ${threshold})`,
          suggestion:
            `Split "${section.heading}" into smaller sub-sections or remove redundant content`,
          line: section.line,
          context: section.heading,
        });
      }
    }

    return issues;
  };
}
