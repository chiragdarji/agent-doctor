import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { loadPlugins } from '../src/plugin-loader.js';
import { analyse } from '../src/analyser/index.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import type { Config } from '../src/types.js';

const PLUGINS_FIXTURE = resolve(import.meta.dirname, 'fixtures', 'plugins');

// ---------------------------------------------------------------------------
// loadPlugins — unit tests
// ---------------------------------------------------------------------------

describe('loadPlugins', () => {
  it('returns empty array when no paths provided', async () => {
    const rules = await loadPlugins([], process.cwd());
    expect(rules).toHaveLength(0);
  });

  it('loads a single rule from a default-export plugin', async () => {
    const rules = await loadPlugins(
      [resolve(PLUGINS_FIXTURE, 'valid-default.js')],
      process.cwd(),
    );
    expect(rules).toHaveLength(1);
    expect(typeof rules[0]).toBe('function');
  });

  it('default-export rule fires on matching content', async () => {
    const rules = await loadPlugins(
      [resolve(PLUGINS_FIXTURE, 'valid-default.js')],
      process.cwd(),
    );
    const issues = rules[0]!('## Intro\nYOLO', 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('plugin-no-yolo');
    expect(issues[0]!.severity).toBe('warning');
  });

  it('default-export rule returns empty array on non-matching content', async () => {
    const rules = await loadPlugins(
      [resolve(PLUGINS_FIXTURE, 'valid-default.js')],
      process.cwd(),
    );
    const issues = rules[0]!('## Intro\nBe careful.', 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });

  it('loads multiple rules from a named-export plugin', async () => {
    const rules = await loadPlugins(
      [resolve(PLUGINS_FIXTURE, 'valid-named.js')],
      process.cwd(),
    );
    expect(rules).toHaveLength(2);
  });

  it('named-export rules each return issues for their own trigger', async () => {
    const rules = await loadPlugins(
      [resolve(PLUGINS_FIXTURE, 'valid-named.js')],
      process.cwd(),
    );
    const allIssues = rules.flatMap((r) => r('foo-marker bar-marker', 'AGENTS.md'));
    const ruleIds = allIssues.map((i) => i.ruleId);
    expect(ruleIds).toContain('plugin-no-foo');
    expect(ruleIds).toContain('plugin-no-bar');
  });

  it('skips a plugin that exports no functions (returns 0 rules)', async () => {
    const rules = await loadPlugins(
      [resolve(PLUGINS_FIXTURE, 'no-functions.js')],
      process.cwd(),
    );
    expect(rules).toHaveLength(0);
  });

  it('skips a non-existent plugin path and continues loading others', async () => {
    const rules = await loadPlugins(
      [
        '/does/not/exist.js',
        resolve(PLUGINS_FIXTURE, 'valid-default.js'),
      ],
      process.cwd(),
    );
    expect(rules).toHaveLength(1);
  });

  it('collects rules from both default and named exports when both exist', async () => {
    // Create a temp plugin that has both
    const tmpDir = resolve(tmpdir(), `agentdoctor-plugin-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const pluginPath = resolve(tmpDir, 'combo.js');
    writeFileSync(
      pluginPath,
      `export default function ruleA() { return []; }\nexport function ruleB() { return []; }\n`,
      'utf8',
    );
    try {
      const rules = await loadPlugins([pluginPath], process.cwd());
      expect(rules).toHaveLength(2);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('resolves relative paths from the given cwd', async () => {
    const rules = await loadPlugins(
      ['./tests/fixtures/plugins/valid-default.js'],
      resolve(import.meta.dirname, '..'), // project root
    );
    expect(rules).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// analyse integration — plugin rules run during full analysis
// ---------------------------------------------------------------------------

describe('analyse — plugin integration', () => {
  it('plugin rule issues appear in AnalysisResult', async () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      layers: ['structural'],
      plugins: [resolve(PLUGINS_FIXTURE, 'valid-default.js')],
    };

    // Write a temp file containing the trigger word
    const tmpDir = resolve(tmpdir(), `agentdoctor-plugin-analyse-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const filePath = resolve(tmpDir, 'CLAUDE.md');
    writeFileSync(filePath, '# Guide\n\nYOLO everything.\n', 'utf8');

    try {
      const result = await analyse(filePath, config);
      const ids = result.issues.map((i) => i.ruleId);
      expect(ids).toContain('plugin-no-yolo');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('plugin rule with custom ruleId can be turned off via config.rules', async () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      layers: ['structural'],
      plugins: [resolve(PLUGINS_FIXTURE, 'valid-default.js')],
      rules: { 'plugin-no-yolo': 'off' },
    };

    const tmpDir = resolve(tmpdir(), `agentdoctor-plugin-off-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const filePath = resolve(tmpDir, 'CLAUDE.md');
    writeFileSync(filePath, '# Guide\n\nYOLO everything.\n', 'utf8');

    try {
      const result = await analyse(filePath, config);
      const ids = result.issues.map((i) => i.ruleId);
      expect(ids).not.toContain('plugin-no-yolo');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('plugin rules do not fire when content has no match', async () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      layers: ['structural'],
      plugins: [resolve(PLUGINS_FIXTURE, 'valid-default.js')],
    };

    const tmpDir = resolve(tmpdir(), `agentdoctor-plugin-nomatch-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const filePath = resolve(tmpDir, 'CLAUDE.md');
    writeFileSync(filePath, '# Guide\n\nBe precise.\n', 'utf8');

    try {
      const result = await analyse(filePath, config);
      const ids = result.issues.map((i) => i.ruleId);
      expect(ids).not.toContain('plugin-no-yolo');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
