import { describe, it, expect, beforeAll } from 'vitest';
import chalk from 'chalk';
import { formatReadinessReport } from '../src/output/readiness-reporter.js';
import type { AnalysisResult, Issue } from '../src/types.js';

// Strip chalk colours for deterministic string matching
beforeAll(() => {
  chalk.level = 0;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function issueWith(ruleId: string, severity: Issue['severity'] = 'warning'): Issue {
  return {
    ruleId,
    severity,
    message: `${ruleId} fired`,
    suggestion: `Fix ${ruleId}`,
  };
}

// ---------------------------------------------------------------------------
// formatReadinessReport — basic shape
// ---------------------------------------------------------------------------

describe('formatReadinessReport', () => {
  it('returns empty string for empty results array', () => {
    expect(formatReadinessReport([])).toBe('');
  });

  it('returns a non-empty string for a single result', () => {
    const out = formatReadinessReport([makeResult()]);
    expect(out.length).toBeGreaterThan(0);
  });

  it('contains all 5 dimension labels', () => {
    const out = formatReadinessReport([makeResult()]);
    expect(out).toContain('Observable');
    expect(out).toContain('Bounded');
    expect(out).toContain('Reversible');
    expect(out).toContain('Tooled');
    expect(out).toContain('Documented');
  });

  it('contains the file basename in the header', () => {
    const out = formatReadinessReport([makeResult({ file: '/repo/AGENTS.md' })]);
    expect(out).toContain('AGENTS.md');
  });

  it('shows "cross-file analysis" label for synthetic cross-file result', () => {
    const out = formatReadinessReport([makeResult({ file: '<cross-file-analysis>' })]);
    expect(out).toContain('cross-file analysis');
  });

  it('shows overall readiness score', () => {
    const out = formatReadinessReport([makeResult({ readinessScore: 72 })]);
    expect(out).toContain('72 / 100');
  });
});

// ---------------------------------------------------------------------------
// All-green path
// ---------------------------------------------------------------------------

describe('formatReadinessReport — all dimensions at 100', () => {
  it('shows pass message for every dimension when score is 100', () => {
    const out = formatReadinessReport([makeResult()]);
    // Each of the 5 dimensions has a pass message containing "✓"
    const checkmarks = (out.match(/✓/g) ?? []).length;
    // At minimum 5 ✓ chars (one per dimension in detail section, plus summary table)
    expect(checkmarks).toBeGreaterThanOrEqual(5);
  });

  it('does not show any warning symbols in the detail sections when all green', () => {
    const out = formatReadinessReport([makeResult()]);
    // Should not contain the fail message for any dimension
    expect(out).not.toContain('cannot confirm completion');
    expect(out).not.toContain('may over- or under-reach');
    expect(out).not.toContain('unrecoverable');
    expect(out).not.toContain('incomplete');
    expect(out).not.toContain('uninformed assumptions');
  });
});

// ---------------------------------------------------------------------------
// Dimension-specific issue grouping
// ---------------------------------------------------------------------------

describe('formatReadinessReport — issue grouping by dimension', () => {
  it('shows missing-success-criteria issue under Observable section', () => {
    const result = makeResult({
      readinessDimensions: { observable: 80, bounded: 90, reversible: 100, tooled: 100, documented: 100 },
      issues: [issueWith('missing-success-criteria')],
    });
    const out = formatReadinessReport([result]);
    // Observable section should contain the rule ID
    expect(out).toContain('missing-success-criteria');
  });

  it('shows missing-recovery-strategy under Reversible section', () => {
    const result = makeResult({
      readinessDimensions: { observable: 100, bounded: 100, reversible: 75, tooled: 100, documented: 100 },
      issues: [issueWith('missing-recovery-strategy')],
    });
    const out = formatReadinessReport([result]);
    expect(out).toContain('missing-recovery-strategy');
    expect(out).toContain('Fix missing-recovery-strategy');
  });

  it('shows missing-tool-list under Tooled section', () => {
    const result = makeResult({
      readinessDimensions: { observable: 100, bounded: 100, reversible: 100, tooled: 80, documented: 100 },
      issues: [issueWith('missing-tool-list', 'suggestion')],
    });
    const out = formatReadinessReport([result]);
    expect(out).toContain('missing-tool-list');
  });

  it('shows todo-in-instructions under Documented section', () => {
    const result = makeResult({
      readinessDimensions: { observable: 100, bounded: 100, reversible: 100, tooled: 100, documented: 80 },
      issues: [issueWith('todo-in-instructions', 'critical')],
    });
    const out = formatReadinessReport([result]);
    expect(out).toContain('todo-in-instructions');
  });

  it('shows cross-file-conflict in both Bounded and Documented sections', () => {
    // bounded: 80 and documented: 75 — both below PASS_THRESHOLD (85) → issue block rendered
    const result = makeResult({
      file: '<cross-file-analysis>',
      readinessDimensions: { observable: 100, bounded: 80, reversible: 100, tooled: 100, documented: 75 },
      issues: [issueWith('cross-file-conflict')],
    });
    const out = formatReadinessReport([result]);
    // cross-file-conflict appears in both Bounded and Documented dimension sections
    const occurrences = (out.match(/cross-file-conflict/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('shows fail message for low-scoring dimension with no active issues', () => {
    // Dimension score below threshold but issues array is empty (e.g. fixed but score not recalculated)
    const result = makeResult({
      readinessDimensions: { observable: 50, bounded: 100, reversible: 100, tooled: 100, documented: 100 },
      issues: [],
    });
    const out = formatReadinessReport([result]);
    expect(out).toContain('No active issues in this dimension');
  });
});

// ---------------------------------------------------------------------------
// Multi-file aggregate
// ---------------------------------------------------------------------------

describe('formatReadinessReport — multi-file aggregate', () => {
  it('includes aggregate section when multiple results provided', () => {
    const a = makeResult({ file: '/a/CLAUDE.md', readinessScore: 80 });
    const b = makeResult({ file: '/b/AGENTS.md', readinessScore: 60 });
    const out = formatReadinessReport([a, b]);
    expect(out).toContain('Aggregate Readiness');
    expect(out).toContain('2 files');
  });

  it('does not include aggregate section for a single result', () => {
    const out = formatReadinessReport([makeResult()]);
    expect(out).not.toContain('Aggregate Readiness');
  });

  it('aggregate shows averaged score', () => {
    const a = makeResult({
      file: '/a/CLAUDE.md',
      readinessScore: 80,
      readinessDimensions: { observable: 80, bounded: 80, reversible: 80, tooled: 80, documented: 80 },
    });
    const b = makeResult({
      file: '/b/AGENTS.md',
      readinessScore: 60,
      readinessDimensions: { observable: 60, bounded: 60, reversible: 60, tooled: 60, documented: 60 },
    });
    const out = formatReadinessReport([a, b]);
    // Average readiness = (80 + 60) / 2 = 70
    expect(out).toContain('70 / 100');
  });

  it('shows each file header in multi-file output', () => {
    const a = makeResult({ file: '/a/CLAUDE.md' });
    const b = makeResult({ file: '/b/AGENTS.md' });
    const out = formatReadinessReport([a, b]);
    expect(out).toContain('CLAUDE.md');
    expect(out).toContain('AGENTS.md');
  });
});
