type Severity = 'critical' | 'warning' | 'suggestion';
type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
type RuleId = 'decision-loop' | 'vague-boundary' | 'tool-mismatch' | 'missing-fallback' | 'scope-bleed' | 'contradiction' | 'ambiguous-pronoun' | 'over-permissive' | 'missing-recovery-strategy' | 'unobservable-outcome' | 'cross-file-conflict' | 'missing-frontmatter' | 'missing-always-apply' | 'legacy-format' | 'token-budget-exceeded' | 'empty-section' | 'duplicate-heading' | 'missing-description' | 'unclosed-code-block' | 'conflicting-frontmatter' | 'missing-file-glob' | 'heading-depth-skip' | 'negation-heavy' | 'todo-in-instructions' | 'missing-success-criteria' | 'hardcoded-environment' | 'missing-tool-list';
interface Issue {
    ruleId: RuleId;
    severity: Severity;
    message: string;
    suggestion: string;
    line?: number;
    context?: string;
    relatedLine?: number;
}
interface ReadinessDimensions {
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
interface AnalysisResult {
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
type AnalysisLayer = 'structural' | 'semantic';
type FileType = 'claude-md' | 'agents-md' | 'cursor-mdc' | 'gemini-md' | 'copilot-instructions' | 'claude-agent' | 'claude-command' | 'unknown';
interface ParsedFile {
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
interface Section {
    heading: string;
    level: number;
    content: string;
    line: number;
    tokenCount: number;
}
type LLMProvider = 'anthropic' | 'openai' | 'openai-compatible';
interface Config {
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
}
declare const DEFAULT_CONFIG: Config;
/** Signature every structural rule must follow. */
type StructuralRule = (content: string, filePath: string) => Issue[];

interface LLMMessage {
    role: 'user' | 'assistant';
    content: string;
}
interface LLMResponse {
    text: string;
}
interface LLMClient {
    complete(params: {
        model: string;
        system: string;
        messages: LLMMessage[];
        maxTokens: number;
    }): Promise<LLMResponse>;
}
/**
 * Infers the LLM provider from a model name string.
 * Returns 'openai' for GPT/O-series models, 'anthropic' for everything else.
 */
declare function inferProvider(model: string): LLMProvider;
/**
 * Resolves the effective provider: uses config.provider if set,
 * otherwise infers from config.model.
 */
declare function resolveProvider(config: Config): LLMProvider;
/**
 * Creates an LLMClient targeting any OpenAI-compatible endpoint.
 * Works with Ollama, LM Studio, vLLM, and other local providers.
 *
 * @param baseURL - e.g. "http://localhost:11434/v1"
 * @param apiKey  - defaults to "ollama" (Ollama ignores it but SDK requires it)
 */
declare function createOpenAICompatibleClient(baseURL: string, apiKey?: string): LLMClient;
/**
 * Wraps the Anthropic Messages API in the unified LLMClient interface.
 */
declare function createAnthropicClient(apiKey: string): LLMClient;
/**
 * Wraps the OpenAI Chat Completions API in the unified LLMClient interface.
 * The system prompt is injected as the first message with role "system".
 */
declare function createOpenAIClient(apiKey: string): LLMClient;
/**
 * Creates the appropriate LLMClient for the given config.
 * Returns null if the required API key / baseURL is not available.
 *
 * Provider resolution order:
 *  1. config.provider explicit override
 *  2. Model name prefix inference (gpt-* / o1-* / o3-* / o4-* → openai)
 *  3. Default: anthropic
 */
declare function createClientFromConfig(config: Config): LLMClient | null;

/**
 * Analyses a single instruction file and returns a full AnalysisResult.
 * Runs the layers specified in `config.layers`.
 */
declare function analyse(filePath: string, config: Config): Promise<AnalysisResult>;
/**
 * Analyses multiple files and returns one AnalysisResult per file.
 */
declare function analyseAll(filePaths: string[], config: Config): Promise<AnalysisResult[]>;

interface FixResult {
    /** Rule IDs that were successfully auto-fixed. */
    fixed: RuleId[];
    /** Rule IDs present in issues but with no auto-fix available. */
    skipped: RuleId[];
    /**
     * Full updated file content (only populated in dry-run mode).
     * Allows callers to preview changes before writing.
     */
    preview?: string;
}
/**
 * Applies auto-fixes for structural issues to the given file.
 *
 * Fixed rules:
 *   - `todo-in-instructions`      → replaces offending line with an HTML comment
 *   - `unclosed-code-block`       → appends closing ``` fence at end of file
 *   - `empty-section`             → inserts a placeholder line after the heading
 *   - `missing-success-criteria`  → appends a success-criteria blockquote at end of section
 *
 * Non-fixable rules are reported in `skipped`.
 * `legacy-format` is always skipped — the file rename must be done manually.
 *
 * @param filePath - absolute path to the instruction file
 * @param issues   - issues array from structural/semantic analysis
 * @param options  - `dryRun: true` returns preview content without writing
 */
declare function applyFixes(filePath: string, issues: Issue[], options?: {
    dryRun?: boolean;
}): Promise<FixResult>;

type InitType = 'claude' | 'cursor' | 'agents';
interface InitOptions {
    type: InitType;
    cwd: string;
    force?: boolean;
}
interface InitResult {
    filePath: string;
    type: InitType;
    existed: boolean;
}
/**
 * Returns the template content string for the given init type.
 */
declare function templateFor(type: InitType): string;
/**
 * Writes a well-structured agent instruction file template to disk.
 *
 * If the target file already exists and `opts.force` is not set, the user is
 * prompted interactively. Throws if the overwrite is declined.
 */
declare function initFile(opts: InitOptions): Promise<InitResult>;

/**
 * Loads .agentdoctor.json from the given directory and deep-merges it with DEFAULT_CONFIG.
 * Returns DEFAULT_CONFIG unchanged if no config file exists.
 */
declare function loadConfig(cwd?: string): Config;

/**
 * Discovers all agent instruction files in a project directory.
 * Checks well-known paths and scans standard subdirectories.
 *
 * @param cwd - Root directory to search from (defaults to process.cwd())
 */
declare function discoverFiles(cwd?: string): string[];

/**
 * Parses a Markdown-based agent instruction file (CLAUDE.md, AGENTS.md, GEMINI.md, etc.)
 * into a structured ParsedFile object.
 */
declare function parseMarkdown(filePath: string): ParsedFile;

/**
 * Parses a Cursor .mdc rule file, extracting YAML frontmatter and markdown sections.
 */
declare function parseMdc(filePath: string): ParsedFile;

/**
 * Parses markdown content into an array of Section objects, one per heading.
 * Content before the first heading is ignored (treated as preamble).
 */
declare function parseSections(content: string): Section[];

/**
 * Routes to the correct parser based on file extension and path.
 * Supports .md, .mdc, and the legacy .cursorrules format.
 */
declare function parseFile(filePath: string): ParsedFile;

/**
 * Runs all structural rules against a parsed file and returns matching issues.
 * Rules disabled via `config.rules[ruleId] === 'off'` are filtered out.
 */
declare function runStructuralAnalysis(parsed: ParsedFile, config: Config): Issue[];

/**
 * Sends the instruction file content to the configured LLM and returns semantic issues.
 * Returns an empty array (without throwing) on any API or parsing failure.
 *
 * Provider selection:
 *  - Set ANTHROPIC_API_KEY to use Claude (default, any claude-* model)
 *  - Set OPENAI_API_KEY to use OpenAI (gpt-*, o1-*, o3-*, o4-* models)
 *  - Or set config.provider explicitly to override inference
 *
 * @param client - Optional LLMClient override (used in tests to inject a mock).
 */
declare function analyseSemantics(content: string, filePath: string, config: Config, client?: LLMClient): Promise<Issue[]>;

/**
 * Formats an AnalysisResult as a human-readable console string.
 */
declare function formatResult(result: AnalysisResult): string;
/**
 * Formats multiple AnalysisResults separated by blank lines.
 */
declare function formatResults(results: AnalysisResult[]): string;
/**
 * Formats an AnalysisResult as pretty-printed JSON.
 */
declare function formatResultJson(result: AnalysisResult): string;
/**
 * Formats multiple AnalysisResults as a JSON array.
 */
declare function formatResultsJson(results: AnalysisResult[]): string;

/**
 * Counts the approximate number of tokens in a string using cl100k_base encoding.
 * Falls back to a character-based approximation if tiktoken is unavailable.
 */
declare function countTokens(text: string): number;

export { type AnalysisLayer, type AnalysisResult, type Config, DEFAULT_CONFIG, type FileType, type FixResult, type Grade, type InitOptions, type InitResult, type InitType, type Issue, type LLMClient, type LLMProvider, type ParsedFile, type RuleId, type Section, type Severity, type StructuralRule, analyse, analyseAll, analyseSemantics, applyFixes, countTokens, createAnthropicClient, createClientFromConfig, createOpenAIClient, createOpenAICompatibleClient, discoverFiles, formatResult, formatResultJson, formatResults, formatResultsJson, inferProvider, initFile, loadConfig, parseFile, parseMarkdown, parseMdc, parseSections, resolveProvider, runStructuralAnalysis, templateFor };
