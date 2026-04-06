import { describe, it, expect, beforeAll } from 'vitest';
import chalk from 'chalk';
import {
  formatResult,
  formatResults,
  formatResultJson,
  formatResultsJson,
} from '../src/output/formatter.js';
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
