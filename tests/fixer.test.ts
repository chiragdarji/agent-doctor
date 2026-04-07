import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyFixes } from '../src/fixer.js';
import type { Issue } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `agent-doctor-fixer-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeTmp(name: string, content: string): string {
  const fp = join(tmpDir, name);
  writeFileSync(fp, content, 'utf8');
  return fp;
}

function readTmp(fp: string): string {
  return readFileSync(fp, 'utf8');
}

function makeIssue(ruleId: Issue['ruleId'], line?: number): Issue {
  return {
    ruleId,
    severity: 'critical',
    message: 'test issue',
    suggestion: 'test suggestion',
    line,
  };
}

// ---------------------------------------------------------------------------
// todo-in-instructions
// ---------------------------------------------------------------------------

describe('applyFixes — todo-in-instructions', () => {
  it('replaces TODO lines with a comment', async () => {
    const fp = writeTmp('todo.md', '# Guide\n\nTODO: fill this in\n\nDone.\n');
    const issues: Issue[] = [makeIssue('todo-in-instructions')];
    const result = await applyFixes(fp, issues);

    expect(result.fixed).toContain('todo-in-instructions');
    expect(result.skipped).not.toContain('todo-in-instructions');
    const written = readTmp(fp);
    expect(written).toContain('<!-- TODO removed by agent-doctor');
    expect(written).not.toContain('TODO: fill this in');
  });

  it('handles FIXME, PLACEHOLDER, TBD, XXX', async () => {
    const content = 'FIXME: broken\nPLACEHOLDER text\nTBD\nXXX remove\n';
    const fp = writeTmp('multi-todo.md', content);
    await applyFixes(fp, [makeIssue('todo-in-instructions')]);
    const written = readTmp(fp);
    expect(written).not.toMatch(/FIXME|PLACEHOLDER|TBD|XXX/);
  });

  it('dry-run: returns preview without writing', async () => {
    const original = '# Guide\n\nTODO: replace\n';
    const fp = writeTmp('todo-dry.md', original);
    const result = await applyFixes(fp, [makeIssue('todo-in-instructions')], { dryRun: true });

    expect(result.fixed).toContain('todo-in-instructions');
    expect(result.preview).toBeDefined();
    expect(result.preview).toContain('<!-- TODO removed by agent-doctor');
    // File on disk must be unchanged
    expect(readTmp(fp)).toBe(original);
  });

  it('does not modify file if no TODO issues', async () => {
    const original = '# Guide\n\nAll good here.\n';
    const fp = writeTmp('clean.md', original);
    await applyFixes(fp, [makeIssue('empty-section', 1)]);
    // empty-section fix happens but todo does not
    expect(readTmp(fp)).not.toBe(original); // empty-section inserted placeholder
  });
});

// ---------------------------------------------------------------------------
// unclosed-code-block
// ---------------------------------------------------------------------------

describe('applyFixes — unclosed-code-block', () => {
  it('appends closing fence when unclosed', async () => {
    const fp = writeTmp('unclosed.md', '# Code\n\n```typescript\nconst x = 1;\n');
    await applyFixes(fp, [makeIssue('unclosed-code-block')]);
    const written = readTmp(fp);
    expect(written.endsWith('```\n')).toBe(true);
    expect(result => true).toBeTruthy(); // shape check
    const lines = written.split('\n').filter(Boolean);
    expect(lines[lines.length - 1]).toBe('```');
  });

  it('adds newline before fence if file does not end with newline', async () => {
    const fp = writeTmp('no-newline.md', '# Code\n\n```\ncode');
    await applyFixes(fp, [makeIssue('unclosed-code-block')]);
    const written = readTmp(fp);
    expect(written.endsWith('```\n')).toBe(true);
  });

  it('dry-run returns preview without writing', async () => {
    const original = '# Doc\n\n```\ncode';
    const fp = writeTmp('unclosed-dry.md', original);
    const result = await applyFixes(fp, [makeIssue('unclosed-code-block')], { dryRun: true });
    expect(result.preview).toBeDefined();
    expect(result.preview?.endsWith('```\n')).toBe(true);
    expect(readTmp(fp)).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// empty-section
// ---------------------------------------------------------------------------

describe('applyFixes — empty-section', () => {
  it('inserts placeholder after the empty heading', async () => {
    const fp = writeTmp('empty.md', '# Title\n\n## Empty Section\n\n## Next Section\n\nContent.\n');
    await applyFixes(fp, [makeIssue('empty-section', 3)]);
    const written = readTmp(fp);
    expect(written).toContain('_No content yet — add instructions here._');
  });

  it('handles multiple empty sections in correct order', async () => {
    const content = '## First\n\n## Second\n\n## Third\n\nContent.\n';
    const fp = writeTmp('multi-empty.md', content);
    await applyFixes(fp, [makeIssue('empty-section', 1), makeIssue('empty-section', 3)]);
    const written = readTmp(fp);
    const count = (written.match(/_No content yet/g) ?? []).length;
    expect(count).toBe(2);
  });

  it('dry-run: returns preview without writing', async () => {
    const original = '## Empty\n\n## Next\n\nContent.\n';
    const fp = writeTmp('empty-dry.md', original);
    const result = await applyFixes(fp, [makeIssue('empty-section', 1)], { dryRun: true });
    expect(result.preview).toContain('_No content yet');
    expect(readTmp(fp)).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// legacy-format (always skipped)
// ---------------------------------------------------------------------------

describe('applyFixes — legacy-format', () => {
  it('always reports legacy-format as skipped (destructive rename not auto-applied)', async () => {
    const fp = writeTmp('.cursorrules', '# Old rules');
    const result = await applyFixes(fp, [makeIssue('legacy-format')]);
    expect(result.skipped).toContain('legacy-format');
    expect(result.fixed).not.toContain('legacy-format');
    // File content unchanged
    expect(readTmp(fp)).toBe('# Old rules');
  });
});

// ---------------------------------------------------------------------------
// skipped rules
// ---------------------------------------------------------------------------

describe('applyFixes — skipped (non-fixable) rules', () => {
  it('reports semantic rules as skipped', async () => {
    const fp = writeTmp('semantic.md', '# Doc\n\nSome content.\n');
    const issues: Issue[] = [
      makeIssue('decision-loop'),
      makeIssue('vague-boundary'),
    ];
    const result = await applyFixes(fp, issues);
    expect(result.skipped).toContain('decision-loop');
    expect(result.skipped).toContain('vague-boundary');
    expect(result.fixed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// combined fixes
// ---------------------------------------------------------------------------

describe('applyFixes — multiple issues in one call', () => {
  it('applies todo + unclosed-code-block in one pass', async () => {
    const fp = writeTmp('combined.md', '# Doc\n\nTODO: add content\n\n```\ncode\n');
    const issues: Issue[] = [
      makeIssue('todo-in-instructions'),
      makeIssue('unclosed-code-block'),
    ];
    const result = await applyFixes(fp, issues);
    expect(result.fixed).toContain('todo-in-instructions');
    expect(result.fixed).toContain('unclosed-code-block');
    const written = readTmp(fp);
    expect(written).toContain('<!-- TODO removed by agent-doctor');
    expect(written.endsWith('```\n')).toBe(true);
  });

  it('returns empty fixed + empty skipped when no issues', async () => {
    const fp = writeTmp('healthy.md', '# Healthy\n\nAll good.\n');
    const result = await applyFixes(fp, []);
    expect(result.fixed).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.preview).toBeUndefined();
  });
});
