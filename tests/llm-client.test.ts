import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAnthropicClient, createOpenAIClient } from '../src/analyser/llm-client.js';
import { inferProvider, resolveProvider, createClientFromConfig } from '../src/analyser/llm-client.js';
import { DEFAULT_CONFIG } from '../src/types.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// inferProvider
// ---------------------------------------------------------------------------
describe('inferProvider', () => {
  const cases: Array<[string, string]> = [
    ['claude-sonnet-4-6', 'anthropic'],
    ['claude-opus-4-6', 'anthropic'],
    ['claude-haiku-4-5-20251001', 'anthropic'],
    ['gpt-4o', 'openai'],
    ['gpt-4o-mini', 'openai'],
    ['gpt-4-turbo', 'openai'],
    ['gpt-3.5-turbo', 'openai'],
    ['o1-preview', 'openai'],
    ['o1-mini', 'openai'],
    ['o3-mini', 'openai'],
    ['o4-mini', 'openai'],
    ['GPT-4O', 'openai'],        // case-insensitive
    ['O1-PREVIEW', 'openai'],    // case-insensitive
    ['unknown-model', 'anthropic'], // default fallback
    ['', 'anthropic'],              // empty string fallback
  ];

  for (const [model, expected] of cases) {
    it(`infers "${expected}" for model "${model}"`, () => {
      expect(inferProvider(model)).toBe(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// resolveProvider
// ---------------------------------------------------------------------------
describe('resolveProvider', () => {
  it('uses config.provider when explicitly set to openai', () => {
    expect(resolveProvider({ ...DEFAULT_CONFIG, model: 'claude-sonnet-4-6', provider: 'openai' }))
      .toBe('openai');
  });

  it('uses config.provider when explicitly set to anthropic', () => {
    expect(resolveProvider({ ...DEFAULT_CONFIG, model: 'gpt-4o', provider: 'anthropic' }))
      .toBe('anthropic');
  });

  it('infers from model when provider is not set', () => {
    expect(resolveProvider({ ...DEFAULT_CONFIG, model: 'gpt-4o' })).toBe('openai');
    expect(resolveProvider({ ...DEFAULT_CONFIG, model: 'claude-sonnet-4-6' })).toBe('anthropic');
  });
});

// ---------------------------------------------------------------------------
// createClientFromConfig
// ---------------------------------------------------------------------------
describe('createClientFromConfig', () => {
  it('returns null when anthropic model and no ANTHROPIC_API_KEY', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    const client = createClientFromConfig({ ...DEFAULT_CONFIG, model: 'claude-sonnet-4-6' });
    expect(client).toBeNull();
  });

  it('returns null when openai model and no OPENAI_API_KEY', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    const client = createClientFromConfig({ ...DEFAULT_CONFIG, model: 'gpt-4o' });
    expect(client).toBeNull();
  });

  it('returns an LLMClient when anthropic model and ANTHROPIC_API_KEY is set', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const client = createClientFromConfig({ ...DEFAULT_CONFIG, model: 'claude-sonnet-4-6' });
    expect(client).not.toBeNull();
    expect(typeof client!.complete).toBe('function');
  });

  it('returns an LLMClient when openai model and OPENAI_API_KEY is set', () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const client = createClientFromConfig({ ...DEFAULT_CONFIG, model: 'gpt-4o' });
    expect(client).not.toBeNull();
    expect(typeof client!.complete).toBe('function');
  });

  it('uses OPENAI_API_KEY when provider is forced to openai even for claude model', () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const client = createClientFromConfig({
      ...DEFAULT_CONFIG,
      model: 'claude-sonnet-4-6',
      provider: 'openai',
    });
    expect(client).not.toBeNull();
  });

  it('uses ANTHROPIC_API_KEY when provider is forced to anthropic even for gpt model', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_API_KEY', '');
    const client = createClientFromConfig({
      ...DEFAULT_CONFIG,
      model: 'gpt-4o',
      provider: 'anthropic',
    });
    expect(client).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// LLMClient interface contract — verified via a hand-rolled stub
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// LLMClient adapter shape — structural tests, no real API calls
// ---------------------------------------------------------------------------
describe('LLMClient adapter shape', () => {
  it('createAnthropicClient returns an LLMClient with a complete function', () => {
    const client = createAnthropicClient('test-key');
    expect(typeof client.complete).toBe('function');
  });

  it('createOpenAIClient returns an LLMClient with a complete function', () => {
    const client = createOpenAIClient('test-key');
    expect(typeof client.complete).toBe('function');
  });
});
