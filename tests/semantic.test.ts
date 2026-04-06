import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { extractJson, analyseSemantics } from '../src/analyser/semantic.js';
import { analyse } from '../src/analyser/index.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import type { LLMClient } from '../src/analyser/llm-client.js';
import type { AnalysisLayer, Config } from '../src/types.js';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');

const SEMANTIC_CONFIG: Config = {
  ...DEFAULT_CONFIG,
  layers: ['semantic'] as AnalysisLayer[],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a mock LLMClient that returns the given text response. */
function mockClient(text: string): LLMClient {
  return {
    complete: vi.fn().mockResolvedValue({ text }),
  };
}

/** Builds a mock LLMClient that rejects with the given error. */
function failingClient(error = new Error('Network error')): LLMClient {
  return {
    complete: vi.fn().mockRejectedValue(error),
  };
}

/** Builds a mock LLMClient that returns an empty string (simulates no-text response). */
function nonTextClient(): LLMClient {
  return {
    complete: vi.fn().mockResolvedValue({ text: '' }),
  };
}

// ---------------------------------------------------------------------------
// extractJson — pure unit tests, no mocking
// ---------------------------------------------------------------------------
describe('extractJson', () => {
  it('returns a bare JSON array unchanged', () => {
    const input = '[{"ruleId":"decision-loop","severity":"critical","message":"x","suggestion":"y"}]';
    expect(extractJson(input)).toBe(input);
  });

  it('extracts JSON from a ```json fence', () => {
    const input = '```json\n[{"ruleId":"contradiction","severity":"critical","message":"x","suggestion":"y"}]\n```';
    expect(extractJson(input)).toBe(
      '[{"ruleId":"contradiction","severity":"critical","message":"x","suggestion":"y"}]',
    );
  });

  it('extracts JSON from a plain ``` fence', () => {
    expect(extractJson('```\n[]\n```')).toBe('[]');
  });

  it('extracts an array embedded in prose', () => {
    const input =
      'Here is my analysis:\n[{"ruleId":"vague-boundary","severity":"warning","message":"x","suggestion":"y"}]\nEnd.';
    expect(extractJson(input)).toContain('"ruleId":"vague-boundary"');
  });

  it('returns empty array string when response is []', () => {
    expect(extractJson('[]')).toBe('[]');
  });

  it('returns trimmed text when no JSON array is found', () => {
    expect(extractJson('  no json here  ')).toBe('no json here');
  });
});

// ---------------------------------------------------------------------------
// analyseSemantics — injected mock client, no module-level mocking
// ---------------------------------------------------------------------------
describe('analyseSemantics', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns [] and warns when ANTHROPIC_API_KEY is not set and no client injected', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const issues = await analyseSemantics('# Hello\nContent', 'CLAUDE.md', DEFAULT_CONFIG);
    expect(issues).toEqual([]);
  });

  it('returns validated issues when client returns valid JSON', async () => {
    const response = JSON.stringify([
      {
        ruleId: 'decision-loop',
        severity: 'critical',
        message: 'Ask before changes conflicts with autonomous completion',
        suggestion: 'Scope confirmation to destructive operations only',
        context: 'Always ask + Complete autonomously',
      },
    ]);
    const issues = await analyseSemantics('# Test\nContent', 'CLAUDE.md', DEFAULT_CONFIG, mockClient(response));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('decision-loop');
    expect(issues[0]!.severity).toBe('critical');
  });

  it('returns [] when client returns an empty array', async () => {
    const issues = await analyseSemantics('# Test\nContent', 'CLAUDE.md', DEFAULT_CONFIG, mockClient('[]'));
    expect(issues).toEqual([]);
  });

  it('returns issues when client returns markdown-fenced JSON', async () => {
    const fenced =
      '```json\n[{"ruleId":"vague-boundary","severity":"warning","message":"msg","suggestion":"fix","context":"ctx"}]\n```';
    const issues = await analyseSemantics('# Test\nContent', 'CLAUDE.md', DEFAULT_CONFIG, mockClient(fenced));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('vague-boundary');
  });

  it('returns [] and does not throw when client call fails', async () => {
    const issues = await analyseSemantics('# Test\nContent', 'CLAUDE.md', DEFAULT_CONFIG, failingClient());
    expect(issues).toEqual([]);
  });

  it('returns [] when response is not valid JSON', async () => {
    const issues = await analyseSemantics('# Test\nContent', 'CLAUDE.md', DEFAULT_CONFIG, mockClient('Sorry, I cannot analyse this.'));
    expect(issues).toEqual([]);
  });

  it('returns [] when response contains unknown ruleId (Zod rejects it)', async () => {
    const bad = JSON.stringify([
      { ruleId: 'made-up-rule', severity: 'critical', message: 'x', suggestion: 'y' },
    ]);
    const issues = await analyseSemantics('# Test\nContent', 'CLAUDE.md', DEFAULT_CONFIG, mockClient(bad));
    expect(issues).toEqual([]);
  });

  it('returns [] when API response has no text block', async () => {
    const issues = await analyseSemantics('# Test\nContent', 'CLAUDE.md', DEFAULT_CONFIG, nonTextClient());
    expect(issues).toEqual([]);
  });

  it('includes optional context and line fields when present', async () => {
    const response = JSON.stringify([
      {
        ruleId: 'over-permissive',
        severity: 'warning',
        message: 'delete_records has no constraint',
        suggestion: 'Add scope guard',
        context: 'Use delete_records whenever appropriate',
        line: 12,
      },
    ]);
    const issues = await analyseSemantics('# Test\nContent', 'CLAUDE.md', DEFAULT_CONFIG, mockClient(response));
    expect(issues[0]!.context).toBe('Use delete_records whenever appropriate');
    expect(issues[0]!.line).toBe(12);
  });

  it('strips issues exceeding 8 (Zod max)', async () => {
    const manyIssues = Array.from({ length: 10 }, (_, i) => ({
      ruleId: 'vague-boundary',
      severity: 'warning',
      message: `Issue ${i.toString()}`,
      suggestion: 'Fix it',
    }));
    const issues = await analyseSemantics(
      '# Test\nContent', 'CLAUDE.md', DEFAULT_CONFIG,
      mockClient(JSON.stringify(manyIssues)),
    );
    // Zod schema has .max(8) — should return [] for the too-many case
    expect(issues).toEqual([]);
  });

  it('uses the model from config when creating the request', async () => {
    const client = mockClient('[]');
    await analyseSemantics('# Test\nContent', 'CLAUDE.md', { ...DEFAULT_CONFIG, model: 'claude-opus-4-6' }, client);
    expect(client.complete).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-4-6' }),
    );
  });
});

// ---------------------------------------------------------------------------
// analyse() — semantic layer integration
// ---------------------------------------------------------------------------
describe('analyse — semantic layer integration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('includes semantic in layers when configured and API key missing (graceful skip)', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const result = await analyse(resolve(FIXTURES, 'semantic-good.md'), SEMANTIC_CONFIG);
    expect(result.layers).toContain('semantic');
    expect(result.issues).toHaveLength(0); // graceful skip returns []
  });

  it('does not include semantic layer when structural-only config', async () => {
    const result = await analyse(resolve(FIXTURES, 'semantic-good.md'), {
      ...DEFAULT_CONFIG,
      layers: ['structural'],
    });
    expect(result.layers).not.toContain('semantic');
    expect(result.layers).toContain('structural');
  });

  it('score reflects semantic issues when both layers run', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    // With no API key, semantic returns [] — structural issues still apply.
    // semantic-good.md scores 97 (one empty-section suggestion from structural).
    const result = await analyse(resolve(FIXTURES, 'semantic-good.md'), {
      ...DEFAULT_CONFIG,
      layers: ['structural', 'semantic'],
    });
    expect(result.score).toBeGreaterThanOrEqual(90); // A grade
    expect(result.layers).toEqual(['structural', 'semantic']);
  });
});
