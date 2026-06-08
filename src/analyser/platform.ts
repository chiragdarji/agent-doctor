import type { FileType, Issue, KnownRuleId, Severity } from '../types.js';

export type TargetPlatform =
  | 'anthropic'
  | 'openai'
  | 'cursor'
  | 'gemini'
  | 'github-copilot'
  | 'windsurf'
  | 'unknown';

/**
 * Maps the parsed file type to the AI platform the file is targeting.
 */
export function detectPlatform(fileType: FileType): TargetPlatform {
  switch (fileType) {
    case 'claude-md':
    case 'claude-agent':
    case 'claude-command':
      return 'anthropic';
    case 'agents-md':
      return 'openai';
    case 'cursor-mdc':
      return 'cursor';
    case 'gemini-md':
      return 'gemini';
    case 'copilot-instructions':
      return 'github-copilot';
    case 'windsurf-rules':
      return 'windsurf';
    case 'roo-rule':
    default:
      return 'unknown';
  }
}

// Platform-specific suggestion overrides per rule
const PLATFORM_SUGGESTIONS: Partial<
  Record<KnownRuleId, Partial<Record<TargetPlatform, string>>>
> = {
  'missing-tool-list': {
    anthropic:
      'Add a "## Available Tools" section listing tools by name. Example: Bash, Read, Write, Edit, Glob, Grep, Agent.',
    openai:
      'Add a "## Tools" section listing the tool names that match your OpenAI tool definitions.',
    cursor:
      'Add a section enumerating the Cursor tools your rule depends on (e.g. codebase_search, read_file, edit_file).',
    'github-copilot':
      'List the tools or extensions available to Copilot in an explicit "## Available capabilities" section.',
  },
  'missing-success-criteria': {
    anthropic:
      'Add a success signal after the task, e.g.: "> ✅ Done when: all tests pass and the feature works end-to-end."',
    openai:
      'Define a completion check, e.g.: "The task is complete when the output matches the expected schema and no errors are logged."',
    cursor:
      'Add a completion note: "Verified when the file compiles, tests pass, and no diagnostics appear."',
  },
  'hardcoded-environment': {
    anthropic:
      'Use placeholders like `<project-root>` or environment variables (e.g. `$HOME`) instead of absolute paths.',
    openai:
      'Replace absolute paths with relative paths or environment variables set in your run configuration.',
    cursor:
      'Use workspace-relative paths — Cursor resolves paths from the workspace root, not the OS home directory.',
  },
  'missing-recovery-strategy': {
    anthropic:
      'Add a fallback instruction, e.g.: "If the deploy fails, run ./rollback.sh and open a GitHub issue with the error log."',
    openai:
      'Define error handling: "On failure, log the error to errors.log, revert the last change, and halt the pipeline."',
    cursor:
      'Add recovery guidance: "If the command errors, undo all file changes and report the error to the user."',
  },
  'unobservable-outcome': {
    anthropic:
      'Add a verification step: "Run `npm test` and confirm all tests pass before considering this done."',
    openai:
      'Add an assertion: "Verify by checking the API response matches the expected schema and status is 200."',
  },
};

// Platform-specific severity overrides per rule
const PLATFORM_SEVERITY_OVERRIDES: Partial<
  Record<KnownRuleId, Partial<Record<TargetPlatform, Severity>>>
> = {
  // On Cursor, missing alwaysApply causes the rule to be silently skipped — treat as critical
  'missing-always-apply': {
    cursor: 'critical',
  },
  // On Cursor, missing frontmatter prevents the file from loading at all
  'missing-frontmatter': {
    cursor: 'critical',
  },
};

/**
 * Enriches issues with platform-specific suggestions and adjusted severities.
 * Returns a new array — the original issues are not mutated.
 */
export function applyPlatformOverrides(issues: Issue[], platform: TargetPlatform): Issue[] {
  if (platform === 'unknown') return issues;

  return issues.map((issue) => {
    const ruleId = issue.ruleId as KnownRuleId;
    const suggestionOverride = PLATFORM_SUGGESTIONS[ruleId]?.[platform];
    const severityOverride = PLATFORM_SEVERITY_OVERRIDES[ruleId]?.[platform];

    if (!suggestionOverride && !severityOverride) return issue;

    return {
      ...issue,
      ...(suggestionOverride ? { suggestion: suggestionOverride } : {}),
      ...(severityOverride ? { severity: severityOverride } : {}),
    };
  });
}
