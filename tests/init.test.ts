import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { initFile, templateFor } from '../src/init.js';
import { runStructuralAnalysis } from '../src/analyser/structural.js';
import { parseFile } from '../src/parser/index.js';
import type { InitType } from '../src/init.js';
import { DEFAULT_CONFIG } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `agent-doctor-init-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Template content tests — each template must produce zero structural issues
// ---------------------------------------------------------------------------

describe('templateFor — zero structural issues', () => {
  it('claude template scores zero structural issues', () => {
    const filePath = join(tmpDir, 'CLAUDE.md');
    writeFileSync(filePath, templateFor('claude'), 'utf8');
    const parsed = parseFile(filePath);
    const issues = runStructuralAnalysis(parsed, DEFAULT_CONFIG);
    if (issues.length > 0) {
      const details = issues.map((i) => `  [${i.ruleId}] ${i.message}`).join('\n');
      throw new Error(`claude template has ${issues.length} structural issue(s):\n${details}`);
    }
    expect(issues).toHaveLength(0);
  });

  it('agents template scores zero structural issues', () => {
    const filePath = join(tmpDir, 'AGENTS.md');
    writeFileSync(filePath, templateFor('agents'), 'utf8');
    const parsed = parseFile(filePath);
    const issues = runStructuralAnalysis(parsed, DEFAULT_CONFIG);
    if (issues.length > 0) {
      const details = issues.map((i) => `  [${i.ruleId}] ${i.message}`).join('\n');
      throw new Error(`agents template has ${issues.length} structural issue(s):\n${details}`);
    }
    expect(issues).toHaveLength(0);
  });

  it('cursor template scores zero structural issues', () => {
    const filePath = join(tmpDir, 'main.mdc');
    writeFileSync(filePath, templateFor('cursor'), 'utf8');
    const parsed = parseFile(filePath);
    const issues = runStructuralAnalysis(parsed, DEFAULT_CONFIG);
    if (issues.length > 0) {
      const details = issues.map((i) => `  [${i.ruleId}] ${i.message}`).join('\n');
      throw new Error(`cursor template has ${issues.length} structural issue(s):\n${details}`);
    }
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// initFile — writes correct file to disk
// ---------------------------------------------------------------------------

describe('initFile — claude (default)', () => {
  it('creates CLAUDE.md in cwd', async () => {
    const result = await initFile({ type: 'claude', cwd: tmpDir });
    expect(result.filePath).toBe(join(tmpDir, 'CLAUDE.md'));
    expect(result.existed).toBe(false);
    expect(existsSync(result.filePath)).toBe(true);
  });

  it('written content matches templateFor("claude")', async () => {
    const result = await initFile({ type: 'claude', cwd: tmpDir });
    const written = readFileSync(result.filePath, 'utf8');
    expect(written).toBe(templateFor('claude'));
  });
});

describe('initFile — agents', () => {
  it('creates AGENTS.md in cwd', async () => {
    const result = await initFile({ type: 'agents', cwd: tmpDir });
    expect(result.filePath).toBe(join(tmpDir, 'AGENTS.md'));
    expect(result.existed).toBe(false);
    expect(existsSync(result.filePath)).toBe(true);
  });

  it('written content matches templateFor("agents")', async () => {
    const result = await initFile({ type: 'agents', cwd: tmpDir });
    const written = readFileSync(result.filePath, 'utf8');
    expect(written).toBe(templateFor('agents'));
  });
});

describe('initFile — cursor', () => {
  it('creates .cursor/rules/main.mdc and intermediate dirs', async () => {
    const result = await initFile({ type: 'cursor', cwd: tmpDir });
    expect(result.filePath).toBe(join(tmpDir, '.cursor', 'rules', 'main.mdc'));
    expect(result.existed).toBe(false);
    expect(existsSync(result.filePath)).toBe(true);
  });

  it('written content contains alwaysApply: true frontmatter', async () => {
    const result = await initFile({ type: 'cursor', cwd: tmpDir });
    const written = readFileSync(result.filePath, 'utf8');
    expect(written).toContain('alwaysApply: true');
  });
});

// ---------------------------------------------------------------------------
// initFile — overwrite guard
// ---------------------------------------------------------------------------

describe('initFile — overwrite guard', () => {
  it('throws when file exists and force is false (non-TTY stdin)', async () => {
    const existingPath = join(tmpDir, 'CLAUDE.md');
    writeFileSync(existingPath, 'existing content', 'utf8');

    // stdin is not a TTY in the test runner → promptOverwrite returns false
    await expect(initFile({ type: 'claude', cwd: tmpDir, force: false })).rejects.toThrow(
      /Aborted/,
    );

    // Existing content must be preserved
    expect(readFileSync(existingPath, 'utf8')).toBe('existing content');
  });

  it('overwrites without prompting when --force is set', async () => {
    const existingPath = join(tmpDir, 'CLAUDE.md');
    writeFileSync(existingPath, 'old content', 'utf8');

    const result = await initFile({ type: 'claude', cwd: tmpDir, force: true });
    expect(result.existed).toBe(true);
    expect(readFileSync(existingPath, 'utf8')).toBe(templateFor('claude'));
  });

  it('overwrites cursor template with --force when file and dirs already exist', async () => {
    // Pre-create the directory and file
    const cursorDir = join(tmpDir, '.cursor', 'rules');
    mkdirSync(cursorDir, { recursive: true });
    const existingPath = join(cursorDir, 'main.mdc');
    writeFileSync(existingPath, 'old cursor content', 'utf8');

    const result = await initFile({ type: 'cursor', cwd: tmpDir, force: true });
    expect(result.existed).toBe(true);
    expect(readFileSync(existingPath, 'utf8')).toBe(templateFor('cursor'));
  });
});

// ---------------------------------------------------------------------------
// Template content spot-checks
// ---------------------------------------------------------------------------

describe('template content spot-checks', () => {
  it('claude template contains a Success criteria block', () => {
    expect(templateFor('claude')).toContain('Success criteria');
  });

  it('agents template contains a Success criteria block', () => {
    expect(templateFor('agents')).toContain('Success criteria');
  });

  it('cursor template has alwaysApply: true frontmatter', () => {
    expect(templateFor('cursor')).toContain('alwaysApply: true');
  });

  it('cursor template has description frontmatter key', () => {
    expect(templateFor('cursor')).toContain('description:');
  });

  it('claude template has an Available Tools section', () => {
    expect(templateFor('claude')).toContain('## Available Tools');
  });

  it('agents template has an Available Tools section', () => {
    expect(templateFor('agents')).toContain('## Available Tools');
  });

  it.each(['claude', 'agents', 'cursor'] as InitType[])(
    '%s template has no hardcoded Unix/Windows paths',
    (type) => {
      const tpl = templateFor(type);
      expect(tpl).not.toMatch(/\/home\/[a-z]/);
      expect(tpl).not.toMatch(/\/usr\/local\//);
      expect(tpl).not.toMatch(/C:\\/);
    },
  );

  it.each(['claude', 'agents', 'cursor'] as InitType[])(
    '%s template has no TODO/FIXME/PLACEHOLDER',
    (type) => {
      expect(templateFor(type)).not.toMatch(/\b(TODO|FIXME|PLACEHOLDER|TBD)\b/);
    },
  );
});
