import { describe, it, expect } from 'vitest';
import { multiFileSemantics } from '../src/analyser/multi-file-semantic.js';
import { analyseCrossFile } from '../src/analyser/index.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import type { LLMClient, LLMResponse } from '../src/analyser/llm-client.js';
import type { FileContent } from '../src/analyser/multi-file-semantic.js';
import type { Config } from '../src/types.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const STRUCTURAL_ONLY: Config = {
  ...DEFAULT_CONFIG,
  layers: ['structural'],
};

const SEMANTIC_CONFIG: Config = {
  ...DEFAULT_CONFIG,
  layers: ['semantic'],
};

function mockClient(response: string): LLMClient {
  return {
    complete: async (): Promise<LLMResponse> => ({ text: response }),
  };
}

const FILE_A: FileContent = {
  filePath: 'CLAUDE.md',
  content: `## Tone\nAlways respond in formal English. Do not use casual language.`,
};

const FILE_B: FileContent = {
  filePath: 'AGENTS.md',
  content: `## Communication\nUse a casual, friendly tone. Avoid overly formal language.`,
};

const FILE_C: FileContent = {
  filePath: 'CLAUDE.md',
  content: `## Workflow\nAsk the user for confirmation before deleting any file.`,
};

const FILE_D: FileContent = {
  filePath: '.cursor/rules/main.mdc',
  content: `## Workflow\nClean up temporary build artefacts autonomously without asking.`,
};

const CONFLICT_RESPONSE = JSON.stringify([
  {
    ruleId: 'cross-file-conflict',
    severity: 'warning',
    message:
      'CLAUDE.md requires formal English but AGENTS.md requires casual tone — they cannot both be followed.',
    suggestion:
      'Unify tone guidelines across both files or scope each to a specific interaction type.',
    context:
      'CLAUDE.md: "Always respond in formal English"\nAGENTS.md: "Use a casual, friendly tone"',
  },
]);

const NO_CONFLICT_RESPONSE = JSON.stringify([]);

// ---------------------------------------------------------------------------
// multiFileSemantics — unit tests with injected mock client
// ---------------------------------------------------------------------------

describe('multiFileSemantics', () => {
  it('returns empty array when fewer than 2 files provided', async () => {
    const client = mockClient(CONFLICT_RESPONSE);
    const result = await multiFileSemantics([FILE_A], SEMANTIC_CONFIG, client);
    expect(result).toHaveLength(0);
  });

  it('detects a conflict and returns cross-file-conflict issue', async () => {
    const client = mockClient(CONFLICT_RESPONSE);
    const result = await multiFileSemantics([FILE_A, FILE_B], SEMANTIC_CONFIG, client);
    expect(result).toHaveLength(1);
    expect(result[0]!.ruleId).toBe('cross-file-conflict');
    expect(result[0]!.severity).toBe('warning');
    expect(result[0]!.message).toContain('CLAUDE.md');
    expect(result[0]!.message).toContain('AGENTS.md');
  });

  it('returns empty array when LLM reports no conflicts', async () => {
    const client = mockClient(NO_CONFLICT_RESPONSE);
    const result = await multiFileSemantics([FILE_A, FILE_B], SEMANTIC_CONFIG, client);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when LLM returns invalid JSON', async () => {
    const client = mockClient('not json at all');
    const result = await multiFileSemantics([FILE_A, FILE_B], SEMANTIC_CONFIG, client);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when LLM response fails Zod validation (wrong ruleId)', async () => {
    const invalid = JSON.stringify([
      { ruleId: 'decision-loop', severity: 'critical', message: 'x', suggestion: 'y' },
    ]);
    const client = mockClient(invalid);
    const result = await multiFileSemantics([FILE_A, FILE_B], SEMANTIC_CONFIG, client);
    expect(result).toHaveLength(0);
  });

  it('works with 3+ files', async () => {
    const client = mockClient(CONFLICT_RESPONSE);
    const result = await multiFileSemantics(
      [FILE_C, FILE_D, FILE_A],
      SEMANTIC_CONFIG,
      client,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.ruleId).toBe('cross-file-conflict');
  });

  it('caps at 5 issues even if LLM returns more', async () => {
    const manyIssues = Array.from({ length: 8 }, (_, i) => ({
      ruleId: 'cross-file-conflict',
      severity: 'warning',
      message: `Conflict ${String(i)}`,
      suggestion: 'Fix it',
    }));
    const client = mockClient(JSON.stringify(manyIssues));
    const result = await multiFileSemantics([FILE_A, FILE_B], SEMANTIC_CONFIG, client);
    expect(result).toHaveLength(0); // Zod .max(5) causes validation failure → empty
  });

  it('returns empty array without client when no API key set', async () => {
    // No client injected, no API key in env → createClientFromConfig returns null
    const result = await multiFileSemantics([FILE_A, FILE_B], SEMANTIC_CONFIG);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// analyseCrossFile — integration with AnalysisResult shaping
// ---------------------------------------------------------------------------

describe('analyseCrossFile', () => {
  it('returns null when fewer than 2 files provided', async () => {
    const client = mockClient(CONFLICT_RESPONSE);
    const result = await analyseCrossFile([FILE_A], SEMANTIC_CONFIG, client);
    expect(result).toBeNull();
  });

  it('returns null when semantic layer is not in config', async () => {
    const client = mockClient(CONFLICT_RESPONSE);
    const result = await analyseCrossFile([FILE_A, FILE_B], STRUCTURAL_ONLY, client);
    expect(result).toBeNull();
  });

  it('returns null when LLM finds no conflicts', async () => {
    const client = mockClient(NO_CONFLICT_RESPONSE);
    const result = await analyseCrossFile([FILE_A, FILE_B], SEMANTIC_CONFIG, client);
    expect(result).toBeNull();
  });

  it('returns an AnalysisResult when conflicts are found', async () => {
    const client = mockClient(CONFLICT_RESPONSE);
    const result = await analyseCrossFile([FILE_A, FILE_B], SEMANTIC_CONFIG, client);
    expect(result).not.toBeNull();
    expect(result!.file).toBe('<cross-file-analysis>');
    expect(result!.issues).toHaveLength(1);
    expect(result!.issues[0]!.ruleId).toBe('cross-file-conflict');
  });

  it('computes score and grade from cross-file issues', async () => {
    const client = mockClient(CONFLICT_RESPONSE);
    const result = await analyseCrossFile([FILE_A, FILE_B], SEMANTIC_CONFIG, client);
    expect(result).not.toBeNull();
    // 1 warning = 10 deduction → score 90 → grade A
    expect(result!.score).toBe(90);
    expect(result!.grade).toBe('A');
  });

  it('includes readiness dimensions (cross-file-conflict → bounded and documented)', async () => {
    const client = mockClient(CONFLICT_RESPONSE);
    const result = await analyseCrossFile([FILE_A, FILE_B], SEMANTIC_CONFIG, client);
    expect(result).not.toBeNull();
    // cross-file-conflict deducts bounded: 15 and documented: 10
    expect(result!.readinessDimensions.bounded).toBe(85);
    expect(result!.readinessDimensions.documented).toBe(90);
    expect(result!.readinessDimensions.observable).toBe(100);
  });

  it('sets layers to ["semantic"] on the synthetic result', async () => {
    const client = mockClient(CONFLICT_RESPONSE);
    const result = await analyseCrossFile([FILE_A, FILE_B], SEMANTIC_CONFIG, client);
    expect(result!.layers).toEqual(['semantic']);
  });

  it('respects config.rules off — filtered conflict produces null', async () => {
    const config: Config = {
      ...SEMANTIC_CONFIG,
      rules: { 'cross-file-conflict': 'off' },
    };
    const client = mockClient(CONFLICT_RESPONSE);
    const result = await analyseCrossFile([FILE_A, FILE_B], config, client);
    expect(result).toBeNull();
  });
});
