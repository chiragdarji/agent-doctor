import { describe, it, expect } from 'vitest';
import { discoverOrgFiles } from '../src/discovery.js';
import { formatOrgReport, formatOrgReportJson } from '../src/output/org-reporter.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import type { AnalysisResult } from '../src/types.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'agent-doctor-org-'));
}

function write(dir: string, relPath: string, content: string): string {
  const full = join(dir, relPath);
  const parent = full.slice(0, full.lastIndexOf('/'));
  if (parent !== dir) mkdirSync(parent, { recursive: true });
  writeFileSync(full, content, 'utf8');
  return full;
}

const GOOD_MD = `# My Agent\n\n## Overview\nSome overview content here.\n\n## Tasks\nDo the thing. Done when tests pass.\n`;
const BASIC_MDC = `---\nalwaysApply: true\ndescription: Test rule\n---\n\n# Rule\n\nSome rule content.\n`;

function makeResult(file: string, score: number): AnalysisResult {
  const grade =
    score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
  return {
    file,
    score,
    grade,
    issues: [],
    tokenCount: 50,
    analysedAt: new Date().toISOString(),
    layers: ['structural'],
    readinessScore: score,
    readinessDimensions: {
      observable: score,
      bounded: score,
      reversible: score,
      tooled: score,
      documented: score,
    },
  };
}

// ---------------------------------------------------------------------------
// discoverOrgFiles
// ---------------------------------------------------------------------------

describe('discoverOrgFiles', () => {
  it('discovers files at the root level', () => {
    const ws = makeWorkspace();
    try {
      write(ws, 'CLAUDE.md', GOOD_MD);
      const found = discoverOrgFiles(ws);
      expect(found.some((f) => f.endsWith('CLAUDE.md'))).toBe(true);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('discovers files in subdirectories', () => {
    const ws = makeWorkspace();
    try {
      write(ws, 'packages/api/CLAUDE.md', GOOD_MD);
      write(ws, 'packages/web/AGENTS.md', GOOD_MD);
      const found = discoverOrgFiles(ws);
      expect(found.some((f) => f.includes('packages/api'))).toBe(true);
      expect(found.some((f) => f.includes('packages/web'))).toBe(true);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('discovers .mdc files inside .cursor/rules', () => {
    const ws = makeWorkspace();
    try {
      write(ws, '.cursor/rules/base.mdc', BASIC_MDC);
      const found = discoverOrgFiles(ws);
      expect(found.some((f) => f.endsWith('base.mdc'))).toBe(true);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('skips node_modules', () => {
    const ws = makeWorkspace();
    try {
      write(ws, 'node_modules/some-pkg/CLAUDE.md', GOOD_MD);
      const found = discoverOrgFiles(ws);
      expect(found.some((f) => f.includes('node_modules'))).toBe(false);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('skips .git directory', () => {
    const ws = makeWorkspace();
    try {
      write(ws, '.git/CLAUDE.md', GOOD_MD);
      const found = discoverOrgFiles(ws);
      expect(found.some((f) => f.includes('/.git/'))).toBe(false);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('respects maxDepth', () => {
    const ws = makeWorkspace();
    try {
      write(ws, 'a/b/c/d/e/CLAUDE.md', GOOD_MD);
      const shallowFound = discoverOrgFiles(ws, 2);
      expect(shallowFound.some((f) => f.includes('a/b/c/d/e'))).toBe(false);
      const deepFound = discoverOrgFiles(ws, 6);
      expect(deepFound.some((f) => f.includes('a/b/c/d/e'))).toBe(true);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('returns empty array for an empty workspace', () => {
    const ws = makeWorkspace();
    try {
      const found = discoverOrgFiles(ws);
      expect(found).toHaveLength(0);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// formatOrgReport
// ---------------------------------------------------------------------------

describe('formatOrgReport', () => {
  const root = '/workspace';

  it('returns no-files message for empty results', () => {
    expect(formatOrgReport([], root)).toContain('No agent instruction files');
  });

  it('contains file count', () => {
    const results = [makeResult('/workspace/CLAUDE.md', 80)];
    const out = formatOrgReport(results, root);
    expect(out).toContain('1 file');
  });

  it('groups by file type', () => {
    const results = [
      makeResult('/workspace/CLAUDE.md', 90),
      makeResult('/workspace/pkg/AGENTS.md', 70),
      makeResult('/workspace/AGENTS.md', 65),
    ];
    const out = formatOrgReport(results, root);
    expect(out).toContain('CLAUDE.md');
    expect(out).toContain('AGENTS.md');
  });

  it('includes all 5 readiness dimension labels', () => {
    const results = [makeResult('/workspace/CLAUDE.md', 75)];
    const out = formatOrgReport(results, root);
    expect(out).toContain('Observable');
    expect(out).toContain('Bounded');
    expect(out).toContain('Reversible');
    expect(out).toContain('Tooled');
    expect(out).toContain('Documented');
  });

  it('includes per-file listing', () => {
    const results = [makeResult('/workspace/CLAUDE.md', 80)];
    const out = formatOrgReport(results, root);
    expect(out).toContain('CLAUDE.md');
  });
});

// ---------------------------------------------------------------------------
// formatOrgReportJson
// ---------------------------------------------------------------------------

describe('formatOrgReportJson', () => {
  const root = '/workspace';

  it('produces valid JSON', () => {
    const results = [makeResult('/workspace/CLAUDE.md', 80)];
    expect(() => JSON.parse(formatOrgReportJson(results, root))).not.toThrow();
  });

  it('has expected top-level fields', () => {
    const results = [makeResult('/workspace/CLAUDE.md', 80)];
    const json = JSON.parse(formatOrgReportJson(results, root)) as Record<string, unknown>;
    expect(json).toHaveProperty('root');
    expect(json).toHaveProperty('fileCount');
    expect(json).toHaveProperty('avgScore');
    expect(json).toHaveProperty('avgReadiness');
    expect(json).toHaveProperty('avgDimensions');
    expect(json).toHaveProperty('byType');
    expect(json).toHaveProperty('files');
  });

  it('fileCount matches results length', () => {
    const results = [
      makeResult('/workspace/CLAUDE.md', 80),
      makeResult('/workspace/AGENTS.md', 70),
    ];
    const json = JSON.parse(formatOrgReportJson(results, root)) as { fileCount: number };
    expect(json.fileCount).toBe(2);
  });

  it('groups by type correctly', () => {
    const results = [
      makeResult('/workspace/CLAUDE.md', 90),
      makeResult('/workspace/pkg/CLAUDE.md', 80),
      makeResult('/workspace/AGENTS.md', 70),
    ];
    const json = JSON.parse(formatOrgReportJson(results, root)) as {
      byType: Array<{ type: string; count: number }>;
    };
    const claudeGroup = json.byType.find((g) => g.type === 'CLAUDE.md');
    expect(claudeGroup?.count).toBe(2);
    const agentsGroup = json.byType.find((g) => g.type === 'AGENTS.md');
    expect(agentsGroup?.count).toBe(1);
  });

  it('avgDimensions has all 5 keys', () => {
    const results = [makeResult('/workspace/CLAUDE.md', 75)];
    const json = JSON.parse(formatOrgReportJson(results, root)) as {
      avgDimensions: Record<string, number>;
    };
    expect(json.avgDimensions).toHaveProperty('observable');
    expect(json.avgDimensions).toHaveProperty('bounded');
    expect(json.avgDimensions).toHaveProperty('reversible');
    expect(json.avgDimensions).toHaveProperty('tooled');
    expect(json.avgDimensions).toHaveProperty('documented');
  });

  it('uses default config structure', () => {
    expect(DEFAULT_CONFIG.plugins).toEqual([]);
  });
});
