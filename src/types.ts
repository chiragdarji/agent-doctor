export type Severity = 'critical' | 'warning' | 'suggestion';

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

/** Well-known rule identifiers — listed for IDE autocomplete and compile-time checks. */
export type KnownRuleId =
  // Semantic rules (single-file)
  | 'decision-loop'
  | 'vague-boundary'
  | 'tool-mismatch'
  | 'missing-fallback'
  | 'scope-bleed'
  | 'contradiction'
  | 'ambiguous-pronoun'
  | 'over-permissive'
  | 'missing-recovery-strategy'
  | 'unobservable-outcome'
  // Semantic rules (cross-file)
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
  | 'todo-in-instructions'
  | 'missing-success-criteria'
  | 'hardcoded-environment'
  | 'missing-tool-list'
  | 'sensitive-data'
  | 'missing-agent-persona'
  | 'redundant-instructions'
  | 'missing-examples'
  | 'instruction-ordering';

/**
 * Rule identifier. Well-known values are listed for autocomplete; plugin rules
 * may use any string (e.g. `'my-org/no-emoji'`).
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export type RuleId = KnownRuleId | (string & {});

export interface Issue {
  ruleId: RuleId;
  severity: Severity;
  message: string;
  suggestion: string;
  line?: number;
  context?: string;
  relatedLine?: number;
}

export interface ReadinessDimensions {
  /** Can the agent verify task completion? */
  observable: number;
  /** Is the scope and task clearly bounded? */
  bounded: number;
  /** Are risky/destructive operations guarded with recovery guidance? */
  reversible: number;
  /** Are available tools enumerated and correctly described? */
  tooled: number;
  /** Is enough context provided for the agent to make decisions? */
  documented: number;
}

export interface AnalysisResult {
  file: string;
  score: number;
  grade: Grade;
  issues: Issue[];
  tokenCount: number;
  analysedAt: string;
  layers: AnalysisLayer[];
  /** Aggregate agent-readiness score (0–100), average of the 5 dimensions. */
  readinessScore: number;
  /** Per-dimension breakdown of agent readiness (Factory.ai + OpenAI Harness framework). */
  readinessDimensions: ReadinessDimensions;
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

export type LLMProvider = 'anthropic' | 'openai' | 'openai-compatible';

export interface Config {
  model: string;
  /** LLM provider. If omitted, inferred from the model name. */
  provider?: LLMProvider;
  /**
   * Base URL for OpenAI-compatible endpoints (e.g. Ollama, LM Studio).
   * Required when provider is "openai-compatible".
   * Example: "http://localhost:11434/v1"
   */
  baseURL?: string;
  layers: AnalysisLayer[];
  rules: Partial<Record<RuleId, Severity | 'off'>>;
  tokenBudgetWarning: number;
  ignore: string[];
  failOn: Severity;
  /** Paths to custom rule plugin modules. Relative paths resolve from cwd. */
  plugins: string[];
}

export const DEFAULT_CONFIG: Config = {
  model: 'claude-sonnet-4-6',
  layers: ['structural', 'semantic'],
  rules: {},
  tokenBudgetWarning: 500,
  ignore: [],
  failOn: 'critical',
  plugins: [],
};

/** Signature every structural rule must follow. */
export type StructuralRule = (content: string, filePath: string) => Issue[];

/** Signature for custom plugin rules. Same as StructuralRule but ruleId may be any string. */
export type PluginRule = StructuralRule;
