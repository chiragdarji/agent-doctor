import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initPreCommit } from '../src/init-pre-commit.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'agent-doctor-precommit-test-'));
}

describe('initPreCommit — native variant', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    // Create a fake .git/hooks directory so the function finds it
    mkdirSync(join(tmpDir, '.git', 'hooks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .git/hooks/pre-commit', async () => {
    const result = await initPreCommit({ cwd: tmpDir, variant: 'native', force: true });
    expect(existsSync(result.filePath)).toBe(true);
    expect(result.filePath).toContain('pre-commit');
    expect(result.existed).toBe(false);
    expect(result.variant).toBe('native');
  });

  it('generated hook is executable (mode includes 0o111)', async () => {
    const { statSync } = await import('node:fs');
    const result = await initPreCommit({ cwd: tmpDir, variant: 'native', force: true });
    const mode = statSync(result.filePath).mode;
    expect(mode & 0o111).toBeGreaterThan(0);
  });

  it('generated hook contains shebang', async () => {
    const result = await initPreCommit({ cwd: tmpDir, variant: 'native', force: true });
    const content = readFileSync(result.filePath, 'utf8');
    expect(content.startsWith('#!/usr/bin/env bash')).toBe(true);
  });

  it('generated hook checks staged instruction files', async () => {
    const result = await initPreCommit({ cwd: tmpDir, variant: 'native', force: true });
    const content = readFileSync(result.filePath, 'utf8');
    expect(content).toContain('git diff --cached');
    expect(content).toContain('agent-doctor');
    expect(content).toContain('--structural-only');
    expect(content).toContain('--fail-on critical');
  });

  it('returns existed:true when hook was already present with agent-doctor reference', async () => {
    await initPreCommit({ cwd: tmpDir, variant: 'native', force: true });
    const result = await initPreCommit({ cwd: tmpDir, variant: 'native', force: true });
    expect(result.existed).toBe(true);
  });

  it('overwrites the hook when force:true', async () => {
    const hookPath = join(tmpDir, '.git', 'hooks', 'pre-commit');
    writeFileSync(hookPath, '#!/bin/sh\necho old', 'utf8');
    await initPreCommit({ cwd: tmpDir, variant: 'native', force: true });
    const content = readFileSync(hookPath, 'utf8');
    expect(content).toContain('agent-doctor');
  });

  it('throws when hook exists without agent-doctor and force is false', async () => {
    const hookPath = join(tmpDir, '.git', 'hooks', 'pre-commit');
    writeFileSync(hookPath, '#!/bin/sh\necho some-other-hook', 'utf8');
    await expect(
      initPreCommit({ cwd: tmpDir, variant: 'native', force: false }),
    ).rejects.toThrow('already exists');
  });

  it('defaults to native variant when variant is omitted', async () => {
    const result = await initPreCommit({ cwd: tmpDir, force: true });
    expect(result.variant).toBe('native');
    expect(result.filePath).toContain('.git');
  });
});

describe('initPreCommit — pre-commit-framework variant', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .pre-commit-config.yaml', async () => {
    const result = await initPreCommit({ cwd: tmpDir, variant: 'pre-commit-framework', force: true });
    expect(existsSync(result.filePath)).toBe(true);
    expect(result.filePath).toContain('.pre-commit-config.yaml');
    expect(result.existed).toBe(false);
    expect(result.variant).toBe('pre-commit-framework');
  });

  it('generated config references agent-doctor', async () => {
    const result = await initPreCommit({ cwd: tmpDir, variant: 'pre-commit-framework', force: true });
    const content = readFileSync(result.filePath, 'utf8');
    expect(content).toContain('agent-doctor');
    expect(content).toContain('--structural-only');
    expect(content).toContain('--fail-on');
  });

  it('returns existed:true when config already references agent-doctor', async () => {
    await initPreCommit({ cwd: tmpDir, variant: 'pre-commit-framework', force: true });
    const result = await initPreCommit({ cwd: tmpDir, variant: 'pre-commit-framework', force: true });
    expect(result.existed).toBe(true);
  });

  it('throws when .pre-commit-config.yaml exists without agent-doctor and force is false', async () => {
    const configPath = join(tmpDir, '.pre-commit-config.yaml');
    writeFileSync(configPath, 'repos:\n  - repo: other\n    hooks:\n      - id: other\n', 'utf8');
    await expect(
      initPreCommit({ cwd: tmpDir, variant: 'pre-commit-framework', force: false }),
    ).rejects.toThrow('already exists');
  });

  it('overwrites existing config when force:true', async () => {
    const configPath = join(tmpDir, '.pre-commit-config.yaml');
    writeFileSync(configPath, 'repos: []\n', 'utf8');
    await initPreCommit({ cwd: tmpDir, variant: 'pre-commit-framework', force: true });
    const content = readFileSync(configPath, 'utf8');
    expect(content).toContain('agent-doctor');
  });
});
