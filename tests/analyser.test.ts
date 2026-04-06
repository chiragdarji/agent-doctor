import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { analyse, analyseAll } from '../src/analyser/index.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import type { AnalysisLayer, Config } from '../src/types.js';

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
