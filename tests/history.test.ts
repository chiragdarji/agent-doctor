import { describe, it, expect, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runHistory } from '../src/analyser/history.js';
import { formatHistory, formatHistoryJson } from '../src/output/history-reporter.js';
import { DEFAULT_CONFIG } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function git(cmd: string, cwd: string): string {
  // -c commit.gpgsign=false: temp fixture repo, signing not required
  const fullCmd = cmd.startsWith('git commit') ? cmd.replace('git commit', 'git -c commit.gpgsign=false commit') : cmd;
  return execSync(fullCmd, {
    encoding: 'utf8',
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@test.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@test.com',
    },
  }).trim();
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-doctor-history-'));
  git('git init', dir);
  git('git config user.email "test@test.com"', dir);
  git('git config user.name "Test"', dir);
  return dir;
}

function commit(dir: string, file: string, content: string, message: string): string {
  writeFileSync(join(dir, file), content, 'utf8');
  git(`git add "${file}"`, dir);
  git(`git commit -m "${message}"`, dir);
  return git('git rev-parse --short HEAD', dir);
}

// ---------------------------------------------------------------------------
// Fixture repo
// ---------------------------------------------------------------------------

const repoDir = makeRepo();
const claudeFile = join(repoDir, 'CLAUDE.md');

const GOOD_CONTENT = `# My Agent

## Overview
This is a well-structured agent instruction file.

## Tasks
Implement the feature. Done when tests pass.

## Tools
- read_file
- write_file
`;

const BAD_CONTENT = `# My Agent

## Overview

## Tasks
TODO: fill this in

\`\`\`
unclosed fence
`;

const hash1 = commit(repoDir, 'CLAUDE.md', GOOD_CONTENT, 'feat: initial good instructions');
const hash2 = commit(repoDir, 'CLAUDE.md', BAD_CONTENT, 'chore: broke it');

afterAll(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const cfg = {
  ...DEFAULT_CONFIG,
  layers: ['structural'] as const,
};

describe('runHistory', () => {
  it('returns one entry per commit that touched the file', async () => {
    const entries = await runHistory(claudeFile, cfg, 10);
    expect(entries).toHaveLength(2);
  });

  it('most recent commit is first', async () => {
    const entries = await runHistory(claudeFile, cfg, 10);
    // hash2 is the most recent commit
    expect(entries[0]!.commit).toBe(hash2);
    expect(entries[1]!.commit).toBe(hash1);
  });

  it('score reflects issue count — bad content has lower score', async () => {
    const entries = await runHistory(claudeFile, cfg, 10);
    const [bad, good] = entries as [typeof entries[0], typeof entries[0]];
    expect(bad.score).toBeLessThan(good.score);
  });

  it('criticalCount reflects critical issues', async () => {
    const entries = await runHistory(claudeFile, cfg, 10);
    // BAD_CONTENT has unclosed-code-block (critical) and todo-in-instructions (critical)
    expect(entries[0]!.criticalCount).toBeGreaterThan(0);
    // GOOD_CONTENT has no critical issues
    expect(entries[1]!.criticalCount).toBe(0);
  });

  it('respects n limit', async () => {
    const entries = await runHistory(claudeFile, cfg, 1);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.commit).toBe(hash2);
  });

  it('returns empty array when file has no history', async () => {
    const entries = await runHistory(join(repoDir, 'nonexistent.md'), cfg, 10);
    expect(entries).toHaveLength(0);
  });

  it('throws when not in a git repo', async () => {
    // Use a file path in /tmp directly (not inside any git repo)
    const nonGitFile = join(tmpdir(), 'not-a-repo', 'CLAUDE.md');
    await expect(runHistory(nonGitFile, cfg, 5)).rejects.toThrow(/git/i);
  });

  it('each entry has required fields', async () => {
    const entries = await runHistory(claudeFile, cfg, 10);
    for (const entry of entries) {
      expect(entry).toMatchObject({
        commit: expect.any(String),
        date: expect.any(String),
        subject: expect.any(String),
        score: expect.any(Number),
        grade: expect.stringMatching(/^[ABCDF]$/),
        issueCount: expect.any(Number),
        criticalCount: expect.any(Number),
        warningCount: expect.any(Number),
        readinessScore: expect.any(Number),
      });
    }
  });
});

describe('formatHistory', () => {
  it('returns no-history message for empty entries', () => {
    const out = formatHistory([], 'CLAUDE.md');
    expect(out).toContain('No git history found');
  });

  it('includes file path in output', async () => {
    const entries = await runHistory(claudeFile, cfg, 10);
    const out = formatHistory(entries, claudeFile);
    expect(out).toContain('Score history');
  });

  it('includes commit hashes', async () => {
    const entries = await runHistory(claudeFile, cfg, 10);
    const out = formatHistory(entries, claudeFile);
    expect(out).toContain(hash1);
    expect(out).toContain(hash2);
  });

  it('includes commit count footer', async () => {
    const entries = await runHistory(claudeFile, cfg, 10);
    const out = formatHistory(entries, claudeFile);
    expect(out).toContain('2 commits');
  });
});

describe('formatHistoryJson', () => {
  it('produces valid JSON with file and history fields', async () => {
    const entries = await runHistory(claudeFile, cfg, 10);
    const json = JSON.parse(formatHistoryJson(entries, claudeFile)) as {
      file: string;
      history: unknown[];
    };
    expect(json.file).toBe(claudeFile);
    expect(Array.isArray(json.history)).toBe(true);
    expect(json.history).toHaveLength(2);
  });

  it('each JSON history entry has all required fields', async () => {
    const entries = await runHistory(claudeFile, cfg, 10);
    const json = JSON.parse(formatHistoryJson(entries, claudeFile)) as {
      history: Array<Record<string, unknown>>;
    };
    const entry = json.history[0]!;
    expect(entry).toHaveProperty('commit');
    expect(entry).toHaveProperty('date');
    expect(entry).toHaveProperty('score');
    expect(entry).toHaveProperty('grade');
    expect(entry).toHaveProperty('readinessScore');
  });
});
