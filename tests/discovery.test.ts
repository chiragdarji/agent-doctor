import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverFiles } from '../src/discovery.js';

let tempDir: string;

function touch(relativePath: string, content = '# Test\nContent.'): void {
  const full = join(tempDir, relativePath);
  mkdirSync(full.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(full, content);
}

beforeEach(() => {
  tempDir = join(tmpdir(), `agent-doctor-discovery-test-${Date.now()}-${Math.random()}`);
  mkdirSync(tempDir, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('discoverFiles', () => {
  it('returns empty array when no instruction files exist', () => {
    expect(discoverFiles(tempDir)).toHaveLength(0);
  });

  it('finds CLAUDE.md', () => {
    touch('CLAUDE.md');
    const files = discoverFiles(tempDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/CLAUDE\.md$/);
  });

  it('finds AGENTS.md', () => {
    touch('AGENTS.md');
    const files = discoverFiles(tempDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/AGENTS\.md$/);
  });

  it('finds GEMINI.md', () => {
    touch('GEMINI.md');
    const files = discoverFiles(tempDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/GEMINI\.md$/);
  });

  it('finds .github/copilot-instructions.md', () => {
    touch('.github/copilot-instructions.md');
    const files = discoverFiles(tempDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/copilot-instructions\.md$/);
  });

  it('finds .cursorrules', () => {
    touch('.cursorrules', 'You are helpful.');
    const files = discoverFiles(tempDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.cursorrules$/);
  });

  it('finds all .mdc files under .cursor/rules/', () => {
    touch('.cursor/rules/typescript.mdc');
    touch('.cursor/rules/testing.mdc');
    const files = discoverFiles(tempDir);
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.endsWith('.mdc'))).toBe(true);
  });

  it('does not pick up non-.mdc files in .cursor/rules/', () => {
    touch('.cursor/rules/notes.txt', 'not a rule');
    touch('.cursor/rules/rule.mdc');
    const files = discoverFiles(tempDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.mdc$/);
  });

  it('finds .claude/agents/*.md', () => {
    touch('.claude/agents/researcher.md');
    touch('.claude/agents/writer.md');
    const files = discoverFiles(tempDir);
    expect(files).toHaveLength(2);
  });

  it('finds .claude/commands/*.md', () => {
    touch('.claude/commands/deploy.md');
    const files = discoverFiles(tempDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/deploy\.md$/);
  });

  it('finds files across all directories simultaneously', () => {
    touch('CLAUDE.md');
    touch('AGENTS.md');
    touch('.cursor/rules/style.mdc');
    touch('.claude/agents/helper.md');
    touch('.claude/commands/review.md');
    const files = discoverFiles(tempDir);
    expect(files).toHaveLength(5);
  });

  it('does not include the same file twice', () => {
    touch('CLAUDE.md');
    const files = discoverFiles(tempDir);
    const unique = new Set(files);
    expect(unique.size).toBe(files.length);
  });

  it('returns absolute paths', () => {
    touch('CLAUDE.md');
    const files = discoverFiles(tempDir);
    expect(files[0]).toMatch(/^\//);
  });
});
