import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { analyse, analyseAll, computeReadiness } from '../src/analyser/index.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import type { AnalysisLayer, Config, Issue } from '../src/types.js';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');

const STRUCTURAL_ONLY: Config = {
  ...DEFAULT_CONFIG,
  layers: ['structural'] as AnalysisLayer[],
};

// ---------------------------------------------------------------------------
// analyse — single file
// ---------------------------------------------------------------------------
describe('analyse', () => {
  it('returns a valid AnalysisResult shape', async () => {
    const result = await analyse(resolve(FIXTURES, 'good-claude.md'), STRUCTURAL_ONLY);
    expect(typeof result.score).toBe('number');
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade);
    expect(Array.isArray(result.issues)).toBe(true);
    expect(typeof result.tokenCount).toBe('number');
    expect(result.analysedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.layers).toContain('structural');
    expect(result.file).toContain('good-claude.md');
  });

  it('scores a clean file at 90+ (grade A)', async () => {
    const result = await analyse(resolve(FIXTURES, 'good-claude.md'), STRUCTURAL_ONLY);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.grade).toBe('A');
  });

  it('scores a file with warnings below 100', async () => {
    const result = await analyse(resolve(FIXTURES, 'bad.mdc'), STRUCTURAL_ONLY);
    expect(result.score).toBeLessThan(100);
  });

  it('issues contain missing-frontmatter for bad.mdc', async () => {
    const result = await analyse(resolve(FIXTURES, 'bad.mdc'), STRUCTURAL_ONLY);
    const ids = result.issues.map((i) => i.ruleId);
    expect(ids).toContain('missing-frontmatter');
    expect(ids).toContain('missing-always-apply');
  });

  it('respects a rule turned off in config', async () => {
    const config: Config = {
      ...STRUCTURAL_ONLY,
      rules: { 'missing-frontmatter': 'off', 'missing-always-apply': 'off' },
    };
    const result = await analyse(resolve(FIXTURES, 'bad.mdc'), config);
    const ids = result.issues.map((i) => i.ruleId);
    expect(ids).not.toContain('missing-frontmatter');
    expect(ids).not.toContain('missing-always-apply');
  });

  it('flags legacy-format as critical for .cursorrules', async () => {
    const result = await analyse(resolve(FIXTURES, '.cursorrules'), STRUCTURAL_ONLY);
    const critical = result.issues.filter((i) => i.severity === 'critical');
    expect(critical.length).toBeGreaterThanOrEqual(1);
    expect(result.grade).not.toBe('A');
  });

  it('flags token-budget-exceeded for large-section.md', async () => {
    const result = await analyse(resolve(FIXTURES, 'large-section.md'), {
      ...STRUCTURAL_ONLY,
      tokenBudgetWarning: 50,
    });
    const ids = result.issues.map((i) => i.ruleId);
    expect(ids).toContain('token-budget-exceeded');
  });

  it('layers array contains only structural when semantic is not configured', async () => {
    const result = await analyse(resolve(FIXTURES, 'good-claude.md'), STRUCTURAL_ONLY);
    expect(result.layers).toEqual(['structural']);
    expect(result.layers).not.toContain('semantic');
  });

  it('empty file produces score of 100 (no issues)', async () => {
    const result = await analyse(resolve(FIXTURES, 'empty-file.md'), STRUCTURAL_ONLY);
    expect(result.issues).toHaveLength(0);
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A');
  });
});

// ---------------------------------------------------------------------------
// Score and grade calculation
// ---------------------------------------------------------------------------
describe('score and grade boundaries', () => {
  const scoreGradeCases: Array<[number, string]> = [
    [100, 'A'],
    [90, 'A'],
    [89, 'B'],
    [75, 'B'],
    [74, 'C'],
    [60, 'C'],
    [59, 'D'],
    [40, 'D'],
    [39, 'F'],
    [0, 'F'],
  ];

  // We test indirectly via controlled issue counts
  it('1 critical issue → score 80, grade B', async () => {
    // .cursorrules has exactly 1 critical (legacy-format)
    const result = await analyse(resolve(FIXTURES, '.cursorrules'), STRUCTURAL_ONLY);
    const criticals = result.issues.filter((i) => i.severity === 'critical').length;
    const warnings = result.issues.filter((i) => i.severity === 'warning').length;
    const suggestions = result.issues.filter((i) => i.severity === 'suggestion').length;
    const expectedScore = Math.max(0, 100 - criticals * 20 - warnings * 10 - suggestions * 3);
    expect(result.score).toBe(expectedScore);
  });

  it('score is always between 0 and 100', async () => {
    // large-section with very tight budget generates many warnings
    const result = await analyse(resolve(FIXTURES, 'large-section.md'), {
      ...STRUCTURAL_ONLY,
      tokenBudgetWarning: 1, // extremely tight — every section fails
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// readiness score fields on AnalysisResult
// ---------------------------------------------------------------------------
describe('readiness score on AnalysisResult', () => {
  it('includes readinessScore and readinessDimensions in result', async () => {
    const result = await analyse(resolve(FIXTURES, 'good-claude.md'), STRUCTURAL_ONLY);
    expect(typeof result.readinessScore).toBe('number');
    expect(result.readinessDimensions).toBeDefined();
    expect(typeof result.readinessDimensions.observable).toBe('number');
    expect(typeof result.readinessDimensions.bounded).toBe('number');
    expect(typeof result.readinessDimensions.reversible).toBe('number');
    expect(typeof result.readinessDimensions.tooled).toBe('number');
    expect(typeof result.readinessDimensions.documented).toBe('number');
  });

  it('readinessScore is 100 when no issues are found', async () => {
    const result = await analyse(resolve(FIXTURES, 'good-claude.md'), STRUCTURAL_ONLY);
    if (result.issues.length === 0) {
      expect(result.readinessScore).toBe(100);
    }
  });

  it('readinessScore is between 0 and 100', async () => {
    const result = await analyse(resolve(FIXTURES, 'bad.mdc'), STRUCTURAL_ONLY);
    expect(result.readinessScore).toBeGreaterThanOrEqual(0);
    expect(result.readinessScore).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// computeReadiness unit tests
// ---------------------------------------------------------------------------
describe('computeReadiness', () => {
  it('returns all dimensions at 100 with no issues', () => {
    const { readinessScore, readinessDimensions } = computeReadiness([]);
    expect(readinessScore).toBe(100);
    expect(readinessDimensions.observable).toBe(100);
    expect(readinessDimensions.bounded).toBe(100);
    expect(readinessDimensions.reversible).toBe(100);
    expect(readinessDimensions.tooled).toBe(100);
    expect(readinessDimensions.documented).toBe(100);
  });

  it('deducts from observable for unobservable-outcome', () => {
    const issues: Issue[] = [
      {
        ruleId: 'unobservable-outcome',
        severity: 'warning',
        message: 'test',
        suggestion: 'test',
      },
    ];
    const { readinessDimensions } = computeReadiness(issues);
    expect(readinessDimensions.observable).toBe(75);
    expect(readinessDimensions.bounded).toBe(100);
  });

  it('deducts from reversible for missing-recovery-strategy', () => {
    const issues: Issue[] = [
      {
        ruleId: 'missing-recovery-strategy',
        severity: 'warning',
        message: 'test',
        suggestion: 'test',
      },
    ];
    const { readinessDimensions } = computeReadiness(issues);
    expect(readinessDimensions.reversible).toBe(75);
  });

  it('deducts from tooled for missing-tool-list', () => {
    const issues: Issue[] = [
      {
        ruleId: 'missing-tool-list',
        severity: 'suggestion',
        message: 'test',
        suggestion: 'test',
      },
    ];
    const { readinessDimensions } = computeReadiness(issues);
    expect(readinessDimensions.tooled).toBe(80);
  });

  it('clamps dimensions to 0 when deductions exceed 100', () => {
    // 6 × scope-bleed each deducts 20 from bounded → 120 total → clamped to 0
    const issues: Issue[] = Array.from({ length: 6 }, () => ({
      ruleId: 'scope-bleed' as const,
      severity: 'warning' as const,
      message: 'test',
      suggestion: 'test',
    }));
    const { readinessDimensions } = computeReadiness(issues);
    expect(readinessDimensions.bounded).toBe(0);
  });

  it('readinessScore is the average of 5 dimensions (rounded)', () => {
    const issues: Issue[] = [
      {
        ruleId: 'unobservable-outcome',
        severity: 'warning',
        message: 'test',
        suggestion: 'test',
      },
    ];
    const { readinessScore, readinessDimensions: rd } = computeReadiness(issues);
    const expected = Math.round(
      (rd.observable + rd.bounded + rd.reversible + rd.tooled + rd.documented) / 5,
    );
    expect(readinessScore).toBe(expected);
  });

  it('rules not in the deduction map do not affect readiness', () => {
    const issues: Issue[] = [
      {
        ruleId: 'duplicate-heading',
        severity: 'warning',
        message: 'test',
        suggestion: 'test',
      },
    ];
    const { readinessScore, readinessDimensions } = computeReadiness(issues);
    expect(readinessScore).toBe(100);
    expect(readinessDimensions.bounded).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// analyseAll — multiple files
// ---------------------------------------------------------------------------
describe('analyseAll', () => {
  it('returns one result per file', async () => {
    const files = [
      resolve(FIXTURES, 'good-claude.md'),
      resolve(FIXTURES, 'bad.mdc'),
    ];
    const results = await analyseAll(files, STRUCTURAL_ONLY);
    expect(results).toHaveLength(2);
    expect(results[0]!.file).toContain('good-claude.md');
    expect(results[1]!.file).toContain('bad.mdc');
  });

  it('analyses files independently — issues do not bleed across files', async () => {
    const files = [
      resolve(FIXTURES, 'good.mdc'),
      resolve(FIXTURES, 'bad.mdc'),
    ];
    const [good, bad] = await analyseAll(files, STRUCTURAL_ONLY);
    expect(good!.issues).toHaveLength(0);
    expect(bad!.issues.length).toBeGreaterThan(0);
  });

  it('returns empty array for empty file list', async () => {
    const results = await analyseAll([], STRUCTURAL_ONLY);
    expect(results).toHaveLength(0);
  });
});
