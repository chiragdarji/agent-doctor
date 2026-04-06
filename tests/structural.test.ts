import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { missingFrontmatter } from '../src/rules/structural/missing-frontmatter.js';
import { missingAlwaysApply } from '../src/rules/structural/missing-always-apply.js';
import { legacyFormat } from '../src/rules/structural/legacy-format.js';
import { createTokenBudgetRule } from '../src/rules/structural/token-budget-exceeded.js';
import { emptySection } from '../src/rules/structural/empty-section.js';
import { runStructuralAnalysis } from '../src/analyser/structural.js';
import { parseFile } from '../src/parser/index.js';
import { DEFAULT_CONFIG } from '../src/types.js';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');

// ---------------------------------------------------------------------------
// missing-frontmatter
// ---------------------------------------------------------------------------
describe('missing-frontmatter', () => {
  it('passes a .mdc file that has frontmatter', () => {
    const issues = missingFrontmatter('---\nalwaysApply: true\n---\n# Hello\n', 'rules/test.mdc');
    expect(issues).toHaveLength(0);
  });

  it('flags a .mdc file without frontmatter', () => {
    const issues = missingFrontmatter('# Hello\nSome content', 'rules/test.mdc');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('missing-frontmatter');
    expect(issues[0]!.severity).toBe('warning');
  });

  it('ignores non-.mdc files', () => {
    const issues = missingFrontmatter('# Hello', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// missing-always-apply
// ---------------------------------------------------------------------------
describe('missing-always-apply', () => {
  it('passes when alwaysApply is true', () => {
    const issues = missingAlwaysApply('---\nalwaysApply: true\n---\n# Hi', 'rules/test.mdc');
    expect(issues).toHaveLength(0);
  });

  it('flags when alwaysApply is false', () => {
    const issues = missingAlwaysApply('---\nalwaysApply: false\n---\n# Hi', 'rules/test.mdc');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('missing-always-apply');
  });

  it('flags when alwaysApply is missing', () => {
    const issues = missingAlwaysApply('---\ndescription: foo\n---\n# Hi', 'rules/test.mdc');
    expect(issues).toHaveLength(1);
  });

  it('ignores non-.mdc files', () => {
    const issues = missingAlwaysApply('# Hello', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// legacy-format
// ---------------------------------------------------------------------------
describe('legacy-format', () => {
  it('flags .cursorrules file', () => {
    const issues = legacyFormat('some content', '/project/.cursorrules');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('legacy-format');
    expect(issues[0]!.severity).toBe('critical');
  });

  it('passes a .mdc file', () => {
    const issues = legacyFormat('some content', 'rules/coding.mdc');
    expect(issues).toHaveLength(0);
  });

  it('passes a CLAUDE.md file', () => {
    const issues = legacyFormat('some content', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// token-budget-exceeded
// ---------------------------------------------------------------------------
describe('token-budget-exceeded', () => {
  it('passes sections within budget', () => {
    const rule = createTokenBudgetRule(500);
    const issues = rule('# Short Section\nJust a few words here.', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags sections exceeding budget', () => {
    const rule = createTokenBudgetRule(5);
    // Generate content longer than 5 tokens
    const longContent = '# Big Section\n' + 'word '.repeat(50);
    const issues = rule(longContent, 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('token-budget-exceeded');
    expect(issues[0]!.severity).toBe('warning');
    expect(issues[0]!.line).toBe(1);
  });

  it('flags only the oversized section, not the small one', () => {
    const rule = createTokenBudgetRule(10);
    const content = [
      '# Small Section',
      'tiny',
      '',
      '# Big Section',
      'word '.repeat(50),
    ].join('\n');
    const issues = rule(content, 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.context).toBe('Big Section');
  });
});

// ---------------------------------------------------------------------------
// empty-section
// ---------------------------------------------------------------------------
describe('empty-section', () => {
  it('passes sections with content', () => {
    const issues = emptySection('# Heading\nSome content here.', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags a heading with no body', () => {
    const issues = emptySection('# Output\n\n# Code Style\nUse TypeScript.', 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('empty-section');
    expect(issues[0]!.context).toBe('Output');
  });

  it('flags multiple empty sections', () => {
    const issues = emptySection('# A\n\n# B\n\n# C\nContent', 'CLAUDE.md');
    expect(issues).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Fixture: good-claude.md
// ---------------------------------------------------------------------------
describe('good-claude.md fixture', () => {
  it('produces no critical or warning issues', () => {
    const parsed = parseFile(resolve(FIXTURES, 'good-claude.md'));
    const issues = runStructuralAnalysis(parsed, DEFAULT_CONFIG);
    const serious = issues.filter((i) => i.severity === 'critical' || i.severity === 'warning');
    expect(serious).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Fixture: bad-claude.md
// ---------------------------------------------------------------------------
describe('bad-claude.md fixture', () => {
  it('flags the empty Output section, no critical or warning issues', () => {
    const parsed = parseFile(resolve(FIXTURES, 'bad-claude.md'));
    const issues = runStructuralAnalysis(parsed, DEFAULT_CONFIG);
    const emptySectionIssues = issues.filter((i) => i.ruleId === 'empty-section');
    expect(emptySectionIssues.length).toBeGreaterThanOrEqual(1);
    // The bad fixture should not produce any critical issues
    const criticals = issues.filter((i) => i.severity === 'critical');
    expect(criticals).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Fixture: bad.mdc (missing frontmatter + missing alwaysApply + empty section)
// ---------------------------------------------------------------------------
describe('bad.mdc fixture', () => {
  it('flags missing frontmatter and missing alwaysApply and empty section', () => {
    const parsed = parseFile(resolve(FIXTURES, 'bad.mdc'));
    const issues = runStructuralAnalysis(parsed, DEFAULT_CONFIG);
    const ruleIds = issues.map((i) => i.ruleId);
    expect(ruleIds).toContain('missing-frontmatter');
    expect(ruleIds).toContain('missing-always-apply');
    expect(ruleIds).toContain('empty-section');
  });
});

// ---------------------------------------------------------------------------
// Fixture: good.mdc (has frontmatter + alwaysApply: true)
// ---------------------------------------------------------------------------
describe('good.mdc fixture', () => {
  it('produces no structural issues', () => {
    const parsed = parseFile(resolve(FIXTURES, 'good.mdc'));
    const issues = runStructuralAnalysis(parsed, DEFAULT_CONFIG);
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Fixture: .cursorrules (legacy format)
// ---------------------------------------------------------------------------
describe('.cursorrules fixture', () => {
  it('flags legacy-format as critical', () => {
    const parsed = parseFile(resolve(FIXTURES, '.cursorrules'));
    const issues = runStructuralAnalysis(parsed, DEFAULT_CONFIG);
    const legacyIssues = issues.filter((i) => i.ruleId === 'legacy-format');
    expect(legacyIssues).toHaveLength(1);
    expect(legacyIssues[0]!.severity).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// Fixture: mdc-no-always-apply.mdc (has frontmatter, missing alwaysApply)
// ---------------------------------------------------------------------------
describe('mdc-no-always-apply.mdc fixture', () => {
  it('passes missing-frontmatter but flags missing-always-apply', () => {
    const parsed = parseFile(resolve(FIXTURES, 'mdc-no-always-apply.mdc'));
    const issues = runStructuralAnalysis(parsed, DEFAULT_CONFIG);
    const ruleIds = issues.map((i) => i.ruleId);
    expect(ruleIds).not.toContain('missing-frontmatter');
    expect(ruleIds).toContain('missing-always-apply');
  });
});

// ---------------------------------------------------------------------------
// Fixture: large-section.md (token budget)
// ---------------------------------------------------------------------------
describe('large-section.md fixture', () => {
  it('flags token-budget-exceeded when threshold is 200 tokens', () => {
    const parsed = parseFile(resolve(FIXTURES, 'large-section.md'));
    // The Behaviour section has 20 detailed rules — well over 200 tokens
    const issues = runStructuralAnalysis(parsed, { ...DEFAULT_CONFIG, tokenBudgetWarning: 200 });
    const budgetIssues = issues.filter((i) => i.ruleId === 'token-budget-exceeded');
    expect(budgetIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag token-budget-exceeded when threshold is raised to 2000', () => {
    const parsed = parseFile(resolve(FIXTURES, 'large-section.md'));
    const issues = runStructuralAnalysis(parsed, { ...DEFAULT_CONFIG, tokenBudgetWarning: 2000 });
    const budgetIssues = issues.filter((i) => i.ruleId === 'token-budget-exceeded');
    expect(budgetIssues).toHaveLength(0);
  });

  it('budget issue includes the section heading in context', () => {
    const parsed = parseFile(resolve(FIXTURES, 'large-section.md'));
    const issues = runStructuralAnalysis(parsed, { ...DEFAULT_CONFIG, tokenBudgetWarning: 50 });
    const budgetIssue = issues.find((i) => i.ruleId === 'token-budget-exceeded');
    expect(budgetIssue?.context).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Fixture: nested.md (deeply nested headings)
// ---------------------------------------------------------------------------
describe('nested.md fixture', () => {
  it('produces no critical or warning issues on well-structured nested headings', () => {
    const parsed = parseFile(resolve(FIXTURES, 'nested.md'));
    const issues = runStructuralAnalysis(parsed, DEFAULT_CONFIG);
    const serious = issues.filter((i) => i.severity === 'critical' || i.severity === 'warning');
    expect(serious).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases: missing-frontmatter
// ---------------------------------------------------------------------------
describe('missing-frontmatter edge cases', () => {
  it('passes a .mdc file with only whitespace before ---', () => {
    const issues = missingFrontmatter('\n---\nalwaysApply: true\n---\n# Hi', 'test.mdc');
    // trimStart means leading newline is ignored — should pass
    expect(issues).toHaveLength(0);
  });

  it('produces a suggestion string in the issue', () => {
    const issues = missingFrontmatter('# No frontmatter', 'test.mdc');
    expect(issues[0]!.suggestion).toBeTruthy();
    expect(issues[0]!.suggestion.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases: missing-always-apply
// ---------------------------------------------------------------------------
describe('missing-always-apply edge cases', () => {
  it('flags when alwaysApply is a string "true" (not boolean)', () => {
    // YAML coercion: "true" string vs true boolean
    const issues = missingAlwaysApply('---\nalwaysApply: "true"\n---\n# Hi', 'test.mdc');
    // String "true" !== boolean true
    expect(issues).toHaveLength(1);
  });

  it('flags when alwaysApply is 1 (not boolean true)', () => {
    const issues = missingAlwaysApply('---\nalwaysApply: 1\n---\n# Hi', 'test.mdc');
    expect(issues).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Edge cases: token-budget-exceeded
// ---------------------------------------------------------------------------
describe('token-budget-exceeded edge cases', () => {
  it('includes line number in flagged issue', () => {
    const rule = createTokenBudgetRule(5);
    const issues = rule('# Big\n' + 'word '.repeat(50), 'CLAUDE.md');
    expect(issues[0]!.line).toBe(1);
  });

  it('handles a file with no sections gracefully (no issues)', () => {
    const rule = createTokenBudgetRule(500);
    const issues = rule('No headings, just prose.', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags multiple oversized sections independently', () => {
    const rule = createTokenBudgetRule(5);
    const content = ['# Big One', 'word '.repeat(30), '', '# Big Two', 'word '.repeat(30)].join('\n');
    const issues = rule(content, 'CLAUDE.md');
    expect(issues).toHaveLength(2);
    expect(issues[0]!.context).toBe('Big One');
    expect(issues[1]!.context).toBe('Big Two');
  });
});

// ---------------------------------------------------------------------------
// Edge cases: empty-section
// ---------------------------------------------------------------------------
describe('empty-section edge cases', () => {
  it('does not flag a section with only whitespace-looking content', () => {
    // Section with actual content (not just blank lines)
    const issues = emptySection('# Section\n  \n  content  \n', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags a section whose body is only blank lines', () => {
    const issues = emptySection('# Empty\n\n\n\n# HasContent\nContent.', 'CLAUDE.md');
    const emptySectionIssue = issues.filter((i) => i.context === 'Empty');
    expect(emptySectionIssue).toHaveLength(1);
  });

  it('includes the correct line number for empty sections', () => {
    const issues = emptySection('# First\nContent.\n\n# EmptyAtLine5\n\n# Third\nContent.', 'CLAUDE.md');
    expect(issues[0]!.line).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// runStructuralAnalysis — config.rules filtering
// ---------------------------------------------------------------------------
describe('runStructuralAnalysis config filtering', () => {
  it('suppresses a rule set to "off"', () => {
    const parsed = parseFile(resolve(FIXTURES, 'bad.mdc'));
    const config = { ...DEFAULT_CONFIG, rules: { 'missing-frontmatter': 'off' as const } };
    const issues = runStructuralAnalysis(parsed, config);
    expect(issues.find((i) => i.ruleId === 'missing-frontmatter')).toBeUndefined();
  });

  it('keeps rules not listed in config.rules', () => {
    const parsed = parseFile(resolve(FIXTURES, 'bad.mdc'));
    const config = { ...DEFAULT_CONFIG, rules: { 'missing-frontmatter': 'off' as const } };
    const issues = runStructuralAnalysis(parsed, config);
    // missing-always-apply should still fire
    expect(issues.find((i) => i.ruleId === 'missing-always-apply')).toBeDefined();
  });

  it('suppresses all rules when all are set to "off"', () => {
    const parsed = parseFile(resolve(FIXTURES, 'bad.mdc'));
    const config = {
      ...DEFAULT_CONFIG,
      rules: {
        'missing-frontmatter': 'off' as const,
        'missing-always-apply': 'off' as const,
        'empty-section': 'off' as const,
      },
    };
    const issues = runStructuralAnalysis(parsed, config);
    expect(issues).toHaveLength(0);
  });
});
