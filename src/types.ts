export type Severity = 'critical' | 'warning' | 'suggestion';

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export type RuleId =
  // Semantic rules
  | 'decision-loop'
  | 'vague-boundary'
  | 'tool-mismatch'
  | 'missing-fallback'
  | 'scope-bleed'
  | 'contradiction'
  | 'ambiguous-pronoun'
  | 'over-permissive'
  | 'cross-file-conflict'
  // Structural rules
  | 'missing-frontmatter'
  | 'missing-always-apply'
  | 'legacy-format'
  | 'token-budget-exceeded'
  | 'empty-section'
  | 'duplicate-heading'
  | 'missing-description'
  | 'unclosed-code-block'
  | 'conflicting-frontmatter'
  | 'missing-file-glob'
  | 'heading-depth-skip'
  | 'negation-heavy'
  | 'todo-in-instructions';

export interface Issue {
  ruleId: RuleId;
  severity: Severity;
  message: string;
  suggestion: string;
  line?: number;
  context?: string;
  relatedLine?: number;
}

export interface AnalysisResult {
  file: string;
  score: number;
  grade: Grade;
  issues: Issue[];
  tokenCount: number;
  analysedAt: string;
  layers: AnalysisLayer[];
}

export type AnalysisLayer = 'structural' | 'semantic';

export type FileType =
  | 'claude-md'
  | 'agents-md'
  | 'cursor-mdc'
  | 'gemini-md'
  | 'copilot-instructions'
  | 'claude-agent'
  | 'claude-command'
  | 'unknown';

export interface ParsedFile {
  filePath: string;
  fileType: FileType;
  /** Full raw file content including frontmatter (what structural rules receive). */
  rawContent: string;
  /** Frontmatter-stripped body (used for section parsing and token counts). */
  content: string;
  frontmatter?: Record<string, unknown>;
  sections: Section[];
  tokenCount: number;
}

export interface Section {
  heading: string;
  level: number;
  content: string;
  line: number;
  tokenCount: number;
}

export type LLMProvider = 'anthropic' | 'openai';

export interface Config {
  model: string;
  /** LLM provider. If omitted, inferred from the model name. */
  provider?: LLMProvider;
  layers: AnalysisLayer[];
  rules: Partial<Record<RuleId, Severity | 'off'>>;
  tokenBudgetWarning: number;
  ignore: string[];
  failOn: Severity;
}

export const DEFAULT_CONFIG: Config = {
  model: 'claude-sonnet-4-6',
  layers: ['structural', 'semantic'],
  rules: {},
  tokenBudgetWarning: 500,
  ignore: [],
  failOn: 'critical',
};

/** Signature every structural rule must follow. */
export type StructuralRule = (content: string, filePath: string) => Issue[];
