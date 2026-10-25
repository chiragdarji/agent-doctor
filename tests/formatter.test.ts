import { describe, it, expect, beforeAll } from 'vitest';
import chalk from 'chalk';
import {
  formatResult,
  formatResults,
  formatResultJson,
  formatResultsJson,
} from '../src/output/formatter.js';
import { formatBadge } from '../src/output/badge.js';
import { formatHtml } from '../src/output/html-reporter.js';
import type { AnalysisResult } from '../src/types.js';

// Disable chalk colours in tests for predictable string matching
beforeAll(() => {
  chalk.level = 0;
});

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    file: '/project/CLAUDE.md',
    score: 100,
    grade: 'A',
    issues: [],
    tokenCount: 250,
    analysedAt: '2026-01-01T00:00:00.000Z',
    layers: ['structural'],
    readinessScore: 100,
    readinessDimensions: {
      observable: 100,
      bounded: 100,
      reversible: 100,
      tooled: 100,
      documented: 100,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatResult — text
// ---------------------------------------------------------------------------
describe('formatResult', () => {
  it('includes the filename in output', () => {
    const output = formatResult(makeResult());
    expect(output).toContain('CLAUDE.md');
  });

  it('shows ✓ No issues found when there are no issues', () => {
    const output = formatResult(makeResult());
    expect(output).toContain('No issues found');
  });

  it('shows score and grade in the footer', () => {
    const output = formatResult(makeResult({ score: 80, grade: 'B' }));
    expect(output).toContain('80 / 100');
    expect(output).toContain('(B)');
  });

  it('includes CRITICAL label for critical issues', () => {
    const result = makeResult({
      score: 80,
      grade: 'B',
      issues: [
        {
          ruleId: 'legacy-format',
          severity: 'critical',
          message: 'Legacy format detected',
          suggestion: 'Migrate to .mdc',
        },
      ],
    });
    const output = formatResult(result);
    expect(output).toContain('CRITICAL');
    expect(output).toContain('legacy-format');
    expect(output).toContain('Legacy format detected');
    expect(output).toContain('→ Migrate to .mdc');
  });

  it('includes WARNING label for warning issues', () => {
    const result = makeResult({
      score: 90,
      grade: 'A',
      issues: [
        {
          ruleId: 'missing-frontmatter',
          severity: 'warning',
          message: 'Missing frontmatter',
          suggestion: 'Add frontmatter',
        },
      ],
    });
    const output = formatResult(result);
    expect(output).toContain('WARNING');
    expect(output).toContain('missing-frontmatter');
  });

  it('includes SUGGEST label for suggestion issues', () => {
    const result = makeResult({
      score: 97,
      grade: 'A',
      issues: [
        {
          ruleId: 'empty-section',
          severity: 'suggestion',
          message: 'Section is empty',
          suggestion: 'Add content',
        },
      ],
    });
    const output = formatResult(result);
    expect(output).toContain('SUGGEST');
    expect(output).toContain('empty-section');
  });

  it('shows issue count summary with correct counts', () => {
    const result = makeResult({
      score: 47,
      grade: 'D',
      issues: [
        { ruleId: 'legacy-format', severity: 'critical', message: 'x', suggestion: 'y' },
        { ruleId: 'missing-frontmatter', severity: 'warning', message: 'x', suggestion: 'y' },
        { ruleId: 'missing-always-apply', severity: 'warning', message: 'x', suggestion: 'y' },
        { ruleId: 'empty-section', severity: 'suggestion', message: 'x', suggestion: 'y' },
      ],
    });
    const output = formatResult(result);
    expect(output).toContain('1 critical');
    expect(output).toContain('2 warnings');
    expect(output).toContain('1 suggestion');
  });

  it('shows line number when issue has a line property', () => {
    const result = makeResult({
      issues: [
        {
          ruleId: 'empty-section',
          severity: 'suggestion',
          message: 'Empty',
          suggestion: 'Add content',
          line: 42,
        },
      ],
    });
    const output = formatResult(result);
    expect(output).toContain('line 42');
  });

  it('does not show Model line for structural-only results', () => {
    const output = formatResult(makeResult({ layers: ['structural'] }));
    expect(output).not.toContain('Model');
  });

  it('shows Model line when semantic layer was used', () => {
    const output = formatResult(makeResult({ layers: ['structural', 'semantic'] }));
    expect(output).toContain('Model');
  });

  it('orders issues: critical first, then warning, then suggestion', () => {
    const result = makeResult({
      issues: [
        { ruleId: 'empty-section', severity: 'suggestion', message: 'S', suggestion: 's' },
        { ruleId: 'missing-frontmatter', severity: 'warning', message: 'W', suggestion: 'w' },
        { ruleId: 'legacy-format', severity: 'critical', message: 'C', suggestion: 'c' },
      ],
    });
    const output = formatResult(result);
    const criticalIdx = output.indexOf('CRITICAL');
    const warningIdx = output.indexOf('WARNING');
    const suggestIdx = output.indexOf('SUGGEST');
    expect(criticalIdx).toBeLessThan(warningIdx);
    expect(warningIdx).toBeLessThan(suggestIdx);
  });
});

// ---------------------------------------------------------------------------
// formatResults — multiple
// ---------------------------------------------------------------------------
describe('formatResults', () => {
  it('formats multiple results separated by newlines', () => {
    const results = [
      makeResult({ file: '/a/CLAUDE.md' }),
      makeResult({ file: '/b/AGENTS.md' }),
    ];
    const output = formatResults(results);
    expect(output).toContain('CLAUDE.md');
    expect(output).toContain('AGENTS.md');
  });
});

// ---------------------------------------------------------------------------
// formatResultJson
// ---------------------------------------------------------------------------
describe('formatResultJson', () => {
  it('produces valid JSON', () => {
    const output = formatResultJson(makeResult());
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('JSON contains all required fields', () => {
    const parsed = JSON.parse(formatResultJson(makeResult({ score: 75, grade: 'B' })));
    expect(parsed).toHaveProperty('file');
    expect(parsed).toHaveProperty('score', 75);
    expect(parsed).toHaveProperty('grade', 'B');
    expect(parsed).toHaveProperty('issues');
    expect(parsed).toHaveProperty('tokenCount');
    expect(parsed).toHaveProperty('analysedAt');
    expect(parsed).toHaveProperty('layers');
  });

  it('serialises issues array correctly', () => {
    const result = makeResult({
      issues: [
        { ruleId: 'legacy-format', severity: 'critical', message: 'msg', suggestion: 'fix' },
      ],
    });
    const parsed = JSON.parse(formatResultJson(result));
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0].ruleId).toBe('legacy-format');
    expect(parsed.issues[0].severity).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// formatResultsJson
// ---------------------------------------------------------------------------
describe('formatResultsJson', () => {
  it('produces a JSON array', () => {
    const output = formatResultsJson([makeResult(), makeResult()]);
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });

  it('empty array produces []', () => {
    const output = formatResultsJson([]);
    expect(JSON.parse(output)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// formatBadge
// ---------------------------------------------------------------------------
describe('formatBadge', () => {
  it('returns lightgrey "no files" badge for empty results', () => {
    const badge = JSON.parse(formatBadge([]));
    expect(badge.color).toBe('lightgrey');
    expect(badge.message).toBe('no files');
  });

  it('returns brightgreen for a perfect score', () => {
    const badge = JSON.parse(formatBadge([makeResult({ score: 100, grade: 'A', issues: [] })]));
    expect(badge.color).toBe('brightgreen');
  });

  it('shows "pass" when there are zero issues', () => {
    const badge = JSON.parse(formatBadge([makeResult({ score: 97, grade: 'A', issues: [] })]));
    expect(badge.message).toContain('pass');
    expect(badge.message).toContain('A');
    expect(badge.message).toContain('97');
  });

  it('shows issue count when issues are present', () => {
    const result = makeResult({
      score: 64,
      grade: 'C',
      issues: [
        { ruleId: 'empty-section', severity: 'warning', message: 'M', suggestion: 'S' },
        { ruleId: 'duplicate-heading', severity: 'warning', message: 'M', suggestion: 'S' },
      ],
    });
    const badge = JSON.parse(formatBadge([result]));
    expect(badge.message).toContain('2 issues');
    expect(badge.message).toContain('C');
  });

  it('shows "1 issue" (singular) for exactly one issue', () => {
    const result = makeResult({
      score: 70,
      grade: 'B',
      issues: [{ ruleId: 'empty-section', severity: 'suggestion', message: 'M', suggestion: 'S' }],
    });
    const badge = JSON.parse(formatBadge([result]));
    expect(badge.message).toContain('1 issue');
    expect(badge.message).not.toContain('1 issues');
  });

  it('uses worst grade across multiple results', () => {
    const results = [
      makeResult({ score: 90, grade: 'A', issues: [] }),
      makeResult({ score: 50, grade: 'F', issues: [{ ruleId: 'empty-section', severity: 'warning', message: 'M', suggestion: 'S' }] }),
    ];
    const badge = JSON.parse(formatBadge(results));
    expect(badge.message).toContain('F');
  });

  it('uses avg score label for multiple results', () => {
    const results = [
      makeResult({ score: 80, grade: 'B', issues: [] }),
      makeResult({ score: 60, grade: 'C', issues: [] }),
    ];
    const badge = JSON.parse(formatBadge(results));
    expect(badge.message).toContain('avg');
  });

  it('returns yellow for scores in 60-84 range', () => {
    const badge = JSON.parse(formatBadge([makeResult({ score: 72, grade: 'C', issues: [] })]));
    expect(badge.color).toBe('yellow');
  });

  it('returns red for scores below 60', () => {
    const badge = JSON.parse(formatBadge([makeResult({ score: 45, grade: 'F', issues: [] })]));
    expect(badge.color).toBe('red');
  });
});

// ---------------------------------------------------------------------------
// formatSarif
// ---------------------------------------------------------------------------
import { formatSarif } from '../src/output/sarif.js';

describe('formatSarif', () => {
  it('produces valid SARIF 2.1.0 structure for empty results', () => {
    const sarif = JSON.parse(formatSarif([]));
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].results).toHaveLength(0);
    expect(sarif.runs[0].tool.driver.name).toBe('agent-doctor');
  });

  it('maps critical severity to SARIF level "error"', () => {
    const result = makeResult({
      issues: [{ ruleId: 'sensitive-data', severity: 'critical', message: 'Key found', suggestion: 'Remove it' }],
    });
    const sarif = JSON.parse(formatSarif([result]));
    expect(sarif.runs[0].results[0].level).toBe('error');
  });

  it('maps warning severity to SARIF level "warning"', () => {
    const result = makeResult({
      issues: [{ ruleId: 'empty-section', severity: 'warning', message: 'Empty', suggestion: 'Fill it' }],
    });
    const sarif = JSON.parse(formatSarif([result]));
    expect(sarif.runs[0].results[0].level).toBe('warning');
  });

  it('maps suggestion severity to SARIF level "note"', () => {
    const result = makeResult({
      issues: [{ ruleId: 'negation-heavy', severity: 'suggestion', message: 'Negative', suggestion: 'Rewrite' }],
    });
    const sarif = JSON.parse(formatSarif([result]));
    expect(sarif.runs[0].results[0].level).toBe('note');
  });

  it('includes line number in region when issue has a line', () => {
    const result = makeResult({
      issues: [{ ruleId: 'todo-in-instructions', severity: 'warning', message: 'TODO', suggestion: 'Fix', line: 42 }],
    });
    const sarif = JSON.parse(formatSarif([result]));
    expect(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine).toBe(42);
  });

  it('includes fix suggestion', () => {
    const result = makeResult({
      issues: [{ ruleId: 'empty-section', severity: 'warning', message: 'M', suggestion: 'Add content here' }],
    });
    const sarif = JSON.parse(formatSarif([result]));
    expect(sarif.runs[0].results[0].fixes[0].description.text).toBe('Add content here');
  });

  it('deduplicates rules across multiple results', () => {
    const results = [
      makeResult({ issues: [{ ruleId: 'empty-section', severity: 'suggestion', message: 'M', suggestion: 'S' }] }),
      makeResult({ issues: [{ ruleId: 'empty-section', severity: 'suggestion', message: 'M2', suggestion: 'S2' }] }),
    ];
    const sarif = JSON.parse(formatSarif(results));
    expect(sarif.runs[0].tool.driver.rules).toHaveLength(1);
  });

  it('includes file artifact in artifacts list', () => {
    const result = makeResult({ file: '/project/CLAUDE.md' });
    result.issues.push({ ruleId: 'empty-section', severity: 'suggestion', message: 'M', suggestion: 'S' });
    const sarif = JSON.parse(formatSarif([result]));
    expect(sarif.runs[0].artifacts[0].location.uri).toBe('/project/CLAUDE.md');
  });
});

// ---------------------------------------------------------------------------
// formatHtml
// ---------------------------------------------------------------------------
describe('formatHtml', () => {
  it('produces a complete HTML document', () => {
    const html = formatHtml([makeResult()]);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes the file path', () => {
    const html = formatHtml([makeResult({ file: '/project/CLAUDE.md' })]);
    expect(html).toContain('CLAUDE.md');
  });

  it('shows score in the output', () => {
    const html = formatHtml([makeResult({ score: 87 })]);
    expect(html).toContain('87');
  });

  it('shows grade', () => {
    const html = formatHtml([makeResult({ grade: 'B' })]);
    expect(html).toContain('>B<');
  });

  it('shows issue rule ID and message', () => {
    const result = makeResult({
      issues: [{ ruleId: 'empty-section', severity: 'warning', message: 'Empty heading found', suggestion: 'Add content' }],
    });
    const html = formatHtml([result]);
    expect(html).toContain('empty-section');
    expect(html).toContain('Empty heading found');
  });

  it('shows "No issues found" for a clean result', () => {
    const html = formatHtml([makeResult()]);
    expect(html).toContain('No issues found');
  });

  it('renders multiple results', () => {
    const results = [
      makeResult({ file: '/project/CLAUDE.md' }),
      makeResult({ file: '/project/AGENTS.md' }),
    ];
    const html = formatHtml(results);
    expect(html).toContain('CLAUDE.md');
    expect(html).toContain('AGENTS.md');
  });

  it('includes readiness dimensions', () => {
    const html = formatHtml([makeResult()]);
    expect(html).toContain('Observable');
    expect(html).toContain('Bounded');
    expect(html).toContain('Reversible');
  });

  it('includes toggle theme button', () => {
    const html = formatHtml([makeResult()]);
    expect(html).toContain('Toggle theme');
  });
});
