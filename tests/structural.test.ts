import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { missingFrontmatter } from '../src/rules/structural/missing-frontmatter.js';
import { missingAlwaysApply } from '../src/rules/structural/missing-always-apply.js';
import { legacyFormat } from '../src/rules/structural/legacy-format.js';
import { createTokenBudgetRule } from '../src/rules/structural/token-budget-exceeded.js';
import { emptySection } from '../src/rules/structural/empty-section.js';
import { duplicateHeading } from '../src/rules/structural/duplicate-heading.js';
import { missingDescription } from '../src/rules/structural/missing-description.js';
import { unclosedCodeBlock } from '../src/rules/structural/unclosed-code-block.js';
import { conflictingFrontmatter } from '../src/rules/structural/conflicting-frontmatter.js';
import { missingFileGlob } from '../src/rules/structural/missing-file-glob.js';
import { headingDepthSkip } from '../src/rules/structural/heading-depth-skip.js';
import { negationHeavy } from '../src/rules/structural/negation-heavy.js';
import { todoInInstructions } from '../src/rules/structural/todo-in-instructions.js';
import { missingSuccessCriteria } from '../src/rules/structural/missing-success-criteria.js';
import { hardcodedEnvironment } from '../src/rules/structural/hardcoded-environment.js';
import { missingToolList } from '../src/rules/structural/missing-tool-list.js';
import { sensitiveData } from '../src/rules/structural/sensitive-data.js';
import { missingAgentPersona } from '../src/rules/structural/missing-agent-persona.js';
import { redundantInstructions } from '../src/rules/structural/redundant-instructions.js';
import { missingExamples } from '../src/rules/structural/missing-examples.js';
import { instructionOrdering } from '../src/rules/structural/instruction-ordering.js';
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

  it('does not flag a heading that has child sub-headings (container section)', () => {
    // ## Rule 1 has no direct text but contains #### Sub rule 1.1 — must NOT be flagged
    const content = '## Rule 1\n\n#### Sub rule 1.1\n\nSome content here.';
    const issues = emptySection(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('does not flag nested container sections at any depth', () => {
    const content = '# Top\n\n## Mid\n\n### Bottom\n\nActual content.';
    const issues = emptySection(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('still flags a heading with no content and no children', () => {
    const content = '## Rule 1\n\n## Rule 2\n\nSome content.';
    const issues = emptySection(content, 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.context).toBe('Rule 1');
  });
});

// ---------------------------------------------------------------------------
// duplicate-heading
// ---------------------------------------------------------------------------
describe('duplicate-heading', () => {
  it('does not flag unique headings', () => {
    const issues = duplicateHeading('## Setup\nContent.\n## Usage\nContent.', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags a heading that appears twice', () => {
    const issues = duplicateHeading('## Setup\nContent.\n## Setup\nMore content.', 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('duplicate-heading');
    expect(issues[0]!.context).toBe('Setup');
  });

  it('is case-insensitive', () => {
    const issues = duplicateHeading('## setup\nContent.\n## SETUP\nMore.', 'CLAUDE.md');
    expect(issues).toHaveLength(1);
  });

  it('records relatedLine pointing to the first occurrence', () => {
    const issues = duplicateHeading('## Rules\nContent.\n\n## Rules\nDuplicate.', 'CLAUDE.md');
    expect(issues[0]!.relatedLine).toBe(1);
    expect(issues[0]!.line).toBe(4);
  });

  it('flags multiple duplicate headings independently', () => {
    const content = '## A\nContent.\n## B\nContent.\n## A\nDup.\n## B\nDup.';
    const issues = duplicateHeading(content, 'CLAUDE.md');
    expect(issues).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// missing-description
// ---------------------------------------------------------------------------
describe('missing-description', () => {
  it('does not flag non-.mdc files', () => {
    const issues = missingDescription('# Heading\nContent.', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags .mdc with no description field', () => {
    const content = '---\nalwaysApply: true\n---\n# Rule\nContent.';
    const issues = missingDescription(content, 'rule.mdc');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('missing-description');
  });

  it('does not flag .mdc with a description', () => {
    const content = '---\nalwaysApply: true\ndescription: TypeScript coding standards\n---\n# Rule';
    const issues = missingDescription(content, 'rule.mdc');
    expect(issues).toHaveLength(0);
  });

  it('flags .mdc with an empty description', () => {
    const content = '---\nalwaysApply: true\ndescription: ""\n---\n# Rule';
    const issues = missingDescription(content, 'rule.mdc');
    expect(issues).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// unclosed-code-block
// ---------------------------------------------------------------------------
describe('unclosed-code-block', () => {
  it('does not flag properly closed code blocks', () => {
    const content = '# Heading\n```ts\nconst x = 1;\n```\nMore content.';
    const issues = unclosedCodeBlock(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags an unclosed backtick fence', () => {
    const content = '# Heading\n```ts\nconst x = 1;\nNo closing fence.';
    const issues = unclosedCodeBlock(content, 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('unclosed-code-block');
    expect(issues[0]!.severity).toBe('critical');
  });

  it('flags an unclosed tilde fence', () => {
    const content = '~~~bash\necho hello\n';
    const issues = unclosedCodeBlock(content, 'CLAUDE.md');
    expect(issues).toHaveLength(1);
  });

  it('does not flag multiple properly closed blocks', () => {
    const content = '```\nblock 1\n```\nText.\n```\nblock 2\n```';
    const issues = unclosedCodeBlock(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('records the line number of the opening fence', () => {
    const content = '# Section\nSome text.\n```ts\nUnclosed.';
    const issues = unclosedCodeBlock(content, 'CLAUDE.md');
    expect(issues[0]!.line).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// conflicting-frontmatter
// ---------------------------------------------------------------------------
describe('conflicting-frontmatter', () => {
  it('does not flag non-.mdc files', () => {
    const issues = conflictingFrontmatter('---\nalwaysApply: true\nglobs: "**/*.ts"\n---', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags alwaysApply:true with globs set', () => {
    const content = '---\nalwaysApply: true\nglobs: "**/*.ts"\n---\n# Rule';
    const issues = conflictingFrontmatter(content, 'rule.mdc');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('conflicting-frontmatter');
  });

  it('does not flag alwaysApply:false with globs', () => {
    const content = '---\nalwaysApply: false\nglobs: "**/*.ts"\n---\n# Rule';
    const issues = conflictingFrontmatter(content, 'rule.mdc');
    expect(issues).toHaveLength(0);
  });

  it('does not flag alwaysApply:true without globs', () => {
    const content = '---\nalwaysApply: true\n---\n# Rule';
    const issues = conflictingFrontmatter(content, 'rule.mdc');
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// missing-file-glob
// ---------------------------------------------------------------------------
describe('missing-file-glob', () => {
  it('does not flag non-.mdc files', () => {
    const issues = missingFileGlob('# Rule\nContent.', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('does not flag alwaysApply:true (glob not needed)', () => {
    const content = '---\nalwaysApply: true\n---\n# Rule';
    const issues = missingFileGlob(content, 'rule.mdc');
    expect(issues).toHaveLength(0);
  });

  it('does not flag when globs are set', () => {
    const content = '---\nalwaysApply: false\nglobs: "**/*.ts"\n---\n# Rule';
    const issues = missingFileGlob(content, 'rule.mdc');
    expect(issues).toHaveLength(0);
  });

  it('flags alwaysApply:false with no globs and no description (warning)', () => {
    const content = '---\nalwaysApply: false\n---\n# Rule';
    const issues = missingFileGlob(content, 'rule.mdc');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('warning');
  });

  it('flags as suggestion when description is present but globs missing', () => {
    const content = '---\nalwaysApply: false\ndescription: TypeScript rules\n---\n# Rule';
    const issues = missingFileGlob(content, 'rule.mdc');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('suggestion');
  });
});

// ---------------------------------------------------------------------------
// heading-depth-skip
// ---------------------------------------------------------------------------
describe('heading-depth-skip', () => {
  it('does not flag sequential heading levels', () => {
    const issues = headingDepthSkip('# H1\n## H2\n### H3', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('does not flag going back up levels', () => {
    const issues = headingDepthSkip('### Deep\n# Back to top', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags skipping one level (## → ####)', () => {
    const issues = headingDepthSkip('## Section\n#### Sub', 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('heading-depth-skip');
  });

  it('flags skipping multiple levels (# → ####)', () => {
    const issues = headingDepthSkip('# Top\n#### Deep', 'CLAUDE.md');
    expect(issues).toHaveLength(1);
  });

  it('does not flag the first heading regardless of level', () => {
    const issues = headingDepthSkip('#### Orphan heading\nContent.', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// negation-heavy
// ---------------------------------------------------------------------------
describe('negation-heavy', () => {
  it('does not flag sections with mostly positive instructions', () => {
    const content = '## Rules\n- Always write tests\n- Use TypeScript\n- Follow naming conventions\n- Add JSDoc comments\n- Keep functions small';
    const issues = negationHeavy(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags sections with >60% negation bullets', () => {
    const content = [
      '## Rules',
      "- Don't use any",
      '- Never skip tests',
      '- Avoid long functions',
      '- Not allowed to use var',
      '- Do not use console.log',
      '- Use TypeScript',
    ].join('\n');
    const issues = negationHeavy(content, 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('negation-heavy');
  });

  it('does not flag sections with fewer than 4 bullets', () => {
    const content = "## Rules\n- Don't use any\n- Never skip tests\n- Avoid var";
    const issues = negationHeavy(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// todo-in-instructions
// ---------------------------------------------------------------------------
describe('todo-in-instructions', () => {
  it('does not flag clean instruction files', () => {
    const issues = todoInInstructions('# Rules\nAlways write tests.\nUse TypeScript.', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags TODO marker', () => {
    const issues = todoInInstructions('# Rules\n- TODO: add tool constraints here', 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('todo-in-instructions');
    expect(issues[0]!.severity).toBe('critical');
  });

  it('flags FIXME marker', () => {
    const issues = todoInInstructions('# Rules\n- FIXME: clarify this rule', 'CLAUDE.md');
    expect(issues).toHaveLength(1);
  });

  it('flags PLACEHOLDER marker', () => {
    const issues = todoInInstructions('# Rules\n- Use PLACEHOLDER tool for file ops', 'CLAUDE.md');
    expect(issues).toHaveLength(1);
  });

  it('flags TBD marker', () => {
    const issues = todoInInstructions('# Rules\n- Model to use: TBD', 'CLAUDE.md');
    expect(issues).toHaveLength(1);
  });

  it('records the correct line number', () => {
    const content = '# Rules\nAlways write tests.\n- TODO: add more rules';
    const issues = todoInInstructions(content, 'CLAUDE.md');
    expect(issues[0]!.line).toBe(3);
  });

  it('flags multiple markers in the same file', () => {
    const content = '# Rules\n- TODO: rule 1\n- FIXME: rule 2\n- Normal rule';
    const issues = todoInInstructions(content, 'CLAUDE.md');
    expect(issues).toHaveLength(2);
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
        'missing-description': 'off' as const,
        'missing-file-glob': 'off' as const,
        'empty-section': 'off' as const,
      },
    };
    const issues = runStructuralAnalysis(parsed, config);
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// missing-success-criteria
// ---------------------------------------------------------------------------
describe('missing-success-criteria', () => {
  it('passes a section with task verbs AND success signals', () => {
    const content = [
      '## Implementation',
      'Implement the payment gateway integration. Verify by running npm test and confirming all tests pass.',
      'Build the new API endpoint. Done when the integration tests are green.',
      'Create the user profile page. Expected: the page renders without errors.',
    ].join('\n');
    const issues = missingSuccessCriteria(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags a section with task verbs and no success signal', () => {
    const content = [
      '## Implementation',
      'Implement the payment gateway integration using Stripe.',
      'Build the webhook handler for all incoming events.',
      'Create the order confirmation email template.',
    ].join('\n');
    const issues = missingSuccessCriteria(content, 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('missing-success-criteria');
    expect(issues[0]!.severity).toBe('warning');
    expect(issues[0]!.context).toBe('Implementation');
  });

  it('skips sections with example/overview/background headings', () => {
    const content = [
      '## Example',
      'Implement the payment gateway using Stripe SDK.',
      'Build the redirect flow for 3DS authentication.',
      'Create the webhook listener on the /webhooks endpoint.',
    ].join('\n');
    const issues = missingSuccessCriteria(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('skips sections with fewer than 3 sentences', () => {
    const content = ['## Quick Task', 'Implement the caching layer.'].join('\n');
    const issues = missingSuccessCriteria(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('does not flag sections without task verbs', () => {
    const content = [
      '## Code Style',
      'TypeScript strict mode — no any.',
      'Named exports only; no default exports.',
      'All async functions must have try/catch blocks.',
    ].join('\n');
    const issues = missingSuccessCriteria(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// hardcoded-environment
// ---------------------------------------------------------------------------
describe('hardcoded-environment', () => {
  it('passes a file with no hardcoded paths', () => {
    const content = '## Setup\nRun `npm install` then `npm start`.\n';
    const issues = hardcodedEnvironment(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags a Unix absolute path to a home directory', () => {
    const content = '## Config\nThe config file lives at /home/ubuntu/project/.env\n';
    const issues = hardcodedEnvironment(content, 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('hardcoded-environment');
    expect(issues[0]!.severity).toBe('warning');
  });

  it('flags a Windows absolute path', () => {
    const content = '## Deployment\nCopy the build to C:\\Users\\admin\\deploy\\\n';
    const issues = hardcodedEnvironment(content, 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('hardcoded-environment');
  });

  it('flags a hardcoded localhost port', () => {
    const content = '## Dev Server\nConnect to localhost:3000 to view the app.\n';
    const issues = hardcodedEnvironment(content, 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('hardcoded-environment');
  });

  it('skips paths inside code blocks', () => {
    const content = '## Example\n```\ncp /home/user/file.txt /tmp/\n```\n';
    const issues = hardcodedEnvironment(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('skips lines that are clearly examples', () => {
    const content = '## Setup\nFor example, you might see /home/username/project in CI logs.\n';
    const issues = hardcodedEnvironment(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// missing-tool-list
// ---------------------------------------------------------------------------
describe('missing-tool-list', () => {
  it('passes a file that has no tool references', () => {
    const content = '## Style\nUse TypeScript strict mode.\n';
    const issues = missingToolList(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('passes when tool references exist AND a tools section is present', () => {
    const content = [
      '## Available Tools',
      '- `search_files` — searches the filesystem',
      '',
      '## Behaviour',
      'Use the search_files tool to locate relevant code.',
    ].join('\n');
    const issues = missingToolList(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags when tool references exist but no tools section is present', () => {
    const content = [
      '## Behaviour',
      'You have access to the search_files tool and the read_file tool.',
      'Call the appropriate tool for each task.',
    ].join('\n');
    const issues = missingToolList(content, 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('missing-tool-list');
    expect(issues[0]!.severity).toBe('suggestion');
  });

  it('recognises "capabilities" as a valid tool section heading', () => {
    const content = [
      '## Capabilities',
      '- `fetch_data` — retrieves records',
      '',
      '## Tasks',
      'Invoke the fetch_data tool to get the data.',
    ].join('\n');
    const issues = missingToolList(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// sensitive-data
// ---------------------------------------------------------------------------
describe('sensitive-data', () => {
  it('does not flag clean files', () => {
    const issues = sensitiveData('# Rules\nUse $API_KEY for authentication.\n', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags an OpenAI-style API key', () => {
    const issues = sensitiveData('Set the key: sk-abcdefghijklmnopqrstuvwx', 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('sensitive-data');
    expect(issues[0]!.severity).toBe('critical');
  });

  it('flags a Bearer token', () => {
    const issues = sensitiveData('Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9', 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('sensitive-data');
  });

  it('flags an AWS access key ID', () => {
    const issues = sensitiveData('AWS key: AKIAIOSFODNN7EXAMPLE', 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('sensitive-data');
  });

  it('flags a GitHub PAT', () => {
    const issues = sensitiveData('Push with: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890', 'CLAUDE.md');
    expect(issues).toHaveLength(1);
  });

  it('does not flag lines with example/placeholder language', () => {
    const issues = sensitiveData('For example: sk-abcdefghijklmnopqrstuvwx (replace with your key)', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('does not flag environment variable references', () => {
    const issues = sensitiveData('Set ANTHROPIC_API_KEY=your-key-here in your environment', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags a private key block', () => {
    const issues = sensitiveData('-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAK\n-----END RSA PRIVATE KEY-----', 'CLAUDE.md');
    expect(issues).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// missing-agent-persona
// ---------------------------------------------------------------------------
describe('missing-agent-persona', () => {
  it('does not flag files with a "you are" statement', () => {
    const content = 'You are a senior TypeScript engineer.\n\n## Rules\n' + 'Use strict mode always.\n'.repeat(30);
    const issues = missingAgentPersona(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('does not flag files with a Role heading', () => {
    const content = '## Role\nYou assist with coding tasks.\n\n## Rules\n' + 'Write tests.\n'.repeat(30);
    const issues = missingAgentPersona(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags a long file with no persona language', () => {
    const content = '## Rules\n' + 'Always write tests. Use TypeScript. Never use any. '.repeat(25);
    const issues = missingAgentPersona(content, 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('missing-agent-persona');
    expect(issues[0]!.severity).toBe('warning');
  });

  it('does not flag short files', () => {
    const content = '## Rules\nUse TypeScript.\n';
    const issues = missingAgentPersona(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('recognises "your role is" language', () => {
    const content = 'Your role is to review pull requests.\n\n## Process\n' + 'Review code.\n'.repeat(30);
    const issues = missingAgentPersona(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// redundant-instructions
// ---------------------------------------------------------------------------
describe('redundant-instructions', () => {
  it('does not flag files with no repetition', () => {
    const content = '## Rules\n- Always write unit tests\n- Use TypeScript strict mode\n- Never commit secrets\n';
    const issues = redundantInstructions(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags a directive appearing 3+ times', () => {
    const directive = '- Always write unit tests for every new function you create';
    const content = `## Rules\n${directive}\n## Testing\n${directive}\n## More\n${directive}\n`;
    const issues = redundantInstructions(content, 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('redundant-instructions');
    expect(issues[0]!.severity).toBe('warning');
  });

  it('does not flag 2 occurrences (below threshold)', () => {
    const directive = '- Always write unit tests for every new function you create';
    const content = `## Rules\n${directive}\n## Testing\n${directive}\n`;
    const issues = redundantInstructions(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('does not flag short lines', () => {
    const content = '## A\n- Yes\n## B\n- Yes\n## C\n- Yes\n';
    const issues = redundantInstructions(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// missing-examples
// ---------------------------------------------------------------------------
describe('missing-examples', () => {
  it('does not flag a simple short section', () => {
    const content = '## Rules\nUse TypeScript. Always write tests.';
    const issues = missingExamples(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('does not flag a section that already has a code block', () => {
    const content = [
      '## Commit Messages',
      'When writing commits, if the change adds a feature then use feat:.',
      'If it fixes a bug, use fix:. You must always include a scope.',
      'Only if the change is a refactor should you use refactor:.',
      'Before you commit, you should check the tests pass.',
      '```',
      'feat(auth): add OAuth2 login flow',
      '```',
    ].join('\n');
    const issues = missingExamples(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags a complex section without examples', () => {
    const content = [
      '## Commit Messages',
      'When writing commits, if the change adds a new feature then you must use the feat: prefix.',
      'If you are fixing a bug you should use fix:. You must always include a scope identifier.',
      'Only when the change is a refactor should you use the refactor: prefix instead.',
      'Before committing you should always run the test suite first to confirm everything passes.',
      'If the tests fail you must never commit and should fix the issue before proceeding.',
    ].join('\n');
    const issues = missingExamples(content, 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('missing-examples');
    expect(issues[0]!.severity).toBe('suggestion');
  });

  it('does not flag example-named sections', () => {
    const content = [
      '## Examples',
      'When writing commits, if the change adds a feature then use feat:.',
      'If it fixes a bug, use fix:. You must always include a scope.',
      'Only if the change is a refactor should you use refactor:.',
      'Before you commit check the tests pass.',
      'If tests fail never commit.',
    ].join('\n');
    const issues = missingExamples(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// instruction-ordering
// ---------------------------------------------------------------------------
describe('instruction-ordering', () => {
  it('does not flag files where safety section comes first', () => {
    const content = [
      '## Security',
      'Never access /etc/passwd or system files.',
      'Do not expose API keys.',
      '',
      '## Workflow',
      'Implement features using TDD. Build and run tests before submitting.',
      'Create PRs for all changes.',
    ].join('\n');
    const issues = instructionOrdering(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('flags a safety section that comes after a task section', () => {
    const content = [
      '## Workflow',
      'Implement features using TDD. Build and run tests before submitting.',
      'Create pull requests for all changes. Execute tests to verify.',
      '',
      '## Security',
      'Never access system files. Do not expose API keys. Must not share credentials.',
    ].join('\n');
    const issues = instructionOrdering(content, 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('instruction-ordering');
    expect(issues[0]!.severity).toBe('suggestion');
  });

  it('does not flag files with only task sections', () => {
    const content = [
      '## Workflow',
      'Implement features. Run tests. Create PRs.',
      '',
      '## Commands',
      'Use npm run test to execute the test suite.',
    ].join('\n');
    const issues = instructionOrdering(content, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('records relatedLine pointing to the task section', () => {
    const content = [
      '## Workflow',
      'Implement and build features. Execute tests. Create pull requests.',
      '',
      '## Access Controls',
      'Never access private keys. Do not expose secrets. Must not modify system files.',
    ].join('\n');
    const issues = instructionOrdering(content, 'CLAUDE.md');
    if (issues.length > 0) {
      expect(issues[0]!.relatedLine).toBeGreaterThan(0);
    }
  });
});
