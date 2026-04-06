import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../src/config.js';
import { DEFAULT_CONFIG } from '../src/types.js';

let tempDir: string;

beforeEach(() => {
  tempDir = join(tmpdir(), `agent-doctor-config-test-${Date.now()}-${Math.random()}`);
  mkdirSync(tempDir, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns DEFAULT_CONFIG when no .agentdoctor.json exists', () => {
    const config = loadConfig(tempDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('returns DEFAULT_CONFIG for a non-existent directory', () => {
    const config = loadConfig('/absolutely/nonexistent/path/xyz');
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('loads a partial config and merges with defaults', () => {
    writeFileSync(
      join(tempDir, '.agentdoctor.json'),
      JSON.stringify({ tokenBudgetWarning: 200 }),
    );
    const config = loadConfig(tempDir);
    expect(config.tokenBudgetWarning).toBe(200);
    expect(config.model).toBe(DEFAULT_CONFIG.model);
    expect(config.layers).toEqual(DEFAULT_CONFIG.layers);
  });

  it('loads a full config override', () => {
    const custom = {
      model: 'claude-opus-4-6',
      layers: ['structural'],
      tokenBudgetWarning: 300,
      ignore: ['legacy/**'],
      failOn: 'warning',
    };
    writeFileSync(join(tempDir, '.agentdoctor.json'), JSON.stringify(custom));
    const config = loadConfig(tempDir);
    expect(config.model).toBe('claude-opus-4-6');
    expect(config.layers).toEqual(['structural']);
    expect(config.tokenBudgetWarning).toBe(300);
    expect(config.ignore).toEqual(['legacy/**']);
    expect(config.failOn).toBe('warning');
  });

  it('deep-merges rules — partial rule override does not wipe other rules', () => {
    writeFileSync(
      join(tempDir, '.agentdoctor.json'),
      JSON.stringify({ rules: { 'empty-section': 'off' } }),
    );
    const config = loadConfig(tempDir);
    expect(config.rules['empty-section']).toBe('off');
    // Other rules from DEFAULT_CONFIG.rules are preserved
    expect(Object.keys(config.rules).length).toBeGreaterThanOrEqual(
      Object.keys(DEFAULT_CONFIG.rules).length,
    );
  });

  it('returns defaults and does not throw on malformed JSON', () => {
    writeFileSync(join(tempDir, '.agentdoctor.json'), '{ invalid json !!!');
    const config = loadConfig(tempDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('returns defaults and does not throw on empty JSON file', () => {
    writeFileSync(join(tempDir, '.agentdoctor.json'), '{}');
    const config = loadConfig(tempDir);
    expect(config.model).toBe(DEFAULT_CONFIG.model);
    expect(config.tokenBudgetWarning).toBe(DEFAULT_CONFIG.tokenBudgetWarning);
  });
});
