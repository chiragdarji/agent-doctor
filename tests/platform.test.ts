import { describe, it, expect } from 'vitest';
import { detectPlatform, applyPlatformOverrides } from '../src/analyser/platform.js';
import { runStructuralAnalysis } from '../src/analyser/structural.js';
import { parseMarkdownContent } from '../src/parser/markdown.js';
import { parseMdcContent } from '../src/parser/mdc.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import type { Issue } from '../src/types.js';

// ---------------------------------------------------------------------------
// detectPlatform
// ---------------------------------------------------------------------------

describe('detectPlatform', () => {
  it('maps claude-md to anthropic', () => {
    expect(detectPlatform('claude-md')).toBe('anthropic');
  });

  it('maps claude-agent to anthropic', () => {
    expect(detectPlatform('claude-agent')).toBe('anthropic');
  });

  it('maps claude-command to anthropic', () => {
    expect(detectPlatform('claude-command')).toBe('anthropic');
  });

  it('maps agents-md to openai', () => {
    expect(detectPlatform('agents-md')).toBe('openai');
  });

  it('maps cursor-mdc to cursor', () => {
    expect(detectPlatform('cursor-mdc')).toBe('cursor');
  });

  it('maps gemini-md to gemini', () => {
    expect(detectPlatform('gemini-md')).toBe('gemini');
  });

  it('maps copilot-instructions to github-copilot', () => {
    expect(detectPlatform('copilot-instructions')).toBe('github-copilot');
  });

  it('maps unknown to unknown', () => {
    expect(detectPlatform('unknown')).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// applyPlatformOverrides
// ---------------------------------------------------------------------------

describe('applyPlatformOverrides', () => {
  const base: Issue = {
    ruleId: 'missing-tool-list',
    severity: 'suggestion',
    message: 'No tool list found',
    suggestion: 'Add a tool list section',
  };

  it('returns the same array reference for unknown platform', () => {
    const issues = [base];
    const result = applyPlatformOverrides(issues, 'unknown');
    expect(result).toBe(issues);
  });

  it('does not mutate original issues', () => {
    const original = { ...base };
    applyPlatformOverrides([original], 'anthropic');
    expect(original.suggestion).toBe('Add a tool list section');
  });

  it('applies anthropic-specific suggestion for missing-tool-list', () => {
    const result = applyPlatformOverrides([base], 'anthropic');
    expect(result[0]!.suggestion).toContain('Bash');
  });

  it('applies openai-specific suggestion for missing-tool-list', () => {
    const result = applyPlatformOverrides([base], 'openai');
    expect(result[0]!.suggestion).toContain('OpenAI');
  });

  it('applies cursor-specific suggestion for missing-tool-list', () => {
    const result = applyPlatformOverrides([base], 'cursor');
    expect(result[0]!.suggestion).toContain('codebase_search');
  });

  it('upgrades missing-always-apply to critical on cursor', () => {
    const issue: Issue = {
      ruleId: 'missing-always-apply',
      severity: 'warning',
      message: 'alwaysApply not set',
      suggestion: 'Add alwaysApply: true',
    };
    const result = applyPlatformOverrides([issue], 'cursor');
    expect(result[0]!.severity).toBe('critical');
  });

  it('does not change severity for non-cursor platforms', () => {
    const issue: Issue = {
      ruleId: 'missing-always-apply',
      severity: 'warning',
      message: 'alwaysApply not set',
      suggestion: 'Add alwaysApply: true',
    };
    const result = applyPlatformOverrides([issue], 'anthropic');
    expect(result[0]!.severity).toBe('warning');
  });

  it('upgrades missing-frontmatter to critical on cursor', () => {
    const issue: Issue = {
      ruleId: 'missing-frontmatter',
      severity: 'warning',
      message: 'No YAML frontmatter found',
      suggestion: 'Add frontmatter block',
    };
    const result = applyPlatformOverrides([issue], 'cursor');
    expect(result[0]!.severity).toBe('critical');
  });

  it('does not change missing-frontmatter severity on non-cursor platforms', () => {
    const issue: Issue = {
      ruleId: 'missing-frontmatter',
      severity: 'warning',
      message: 'No YAML frontmatter found',
      suggestion: 'Add frontmatter block',
    };
    const result = applyPlatformOverrides([issue], 'anthropic');
    expect(result[0]!.severity).toBe('warning');
  });

  it('leaves rules without overrides unchanged', () => {
    const issue: Issue = {
      ruleId: 'duplicate-heading',
      severity: 'warning',
      message: 'Duplicate heading',
      suggestion: 'Remove duplicate heading',
    };
    const result = applyPlatformOverrides([issue], 'anthropic');
    expect(result[0]).toStrictEqual(issue);
  });
});

// ---------------------------------------------------------------------------
// Integration: runStructuralAnalysis applies platform-specific suggestions
// ---------------------------------------------------------------------------

const CLAUDE_MD_WITH_TOOL_REFS = `# My Agent

Use the read_file tool to read documents. Then call write_file to save.

## Tasks

Implement the feature.
`;

const MDC_CONTENT = `---
alwaysApply: false
---

# My Cursor Rule

Use codebase_search to find relevant files.

## Tasks

Implement the feature.
`;

describe('runStructuralAnalysis platform integration', () => {
  it('uses anthropic-specific suggestion on CLAUDE.md for missing-tool-list', () => {
    const parsed = parseMarkdownContent('CLAUDE.md', CLAUDE_MD_WITH_TOOL_REFS);
    const issues = runStructuralAnalysis(parsed, DEFAULT_CONFIG);
    const toolIssue = issues.find((i) => i.ruleId === 'missing-tool-list');
    if (toolIssue) {
      expect(toolIssue.suggestion).toContain('Bash');
    }
  });

  it('uses cursor-specific suggestion on .mdc for missing-tool-list', () => {
    const parsed = parseMdcContent('rules/my-rule.mdc', MDC_CONTENT);
    const issues = runStructuralAnalysis(parsed, DEFAULT_CONFIG);
    const toolIssue = issues.find((i) => i.ruleId === 'missing-tool-list');
    if (toolIssue) {
      expect(toolIssue.suggestion).toContain('codebase_search');
    }
  });

  it('upgrades missing-always-apply to critical on .mdc files', () => {
    const parsed = parseMdcContent('rules/my-rule.mdc', MDC_CONTENT);
    const issues = runStructuralAnalysis(parsed, DEFAULT_CONFIG);
    const alwaysApplyIssue = issues.find((i) => i.ruleId === 'missing-always-apply');
    if (alwaysApplyIssue) {
      expect(alwaysApplyIssue.severity).toBe('critical');
    }
  });
});
