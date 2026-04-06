/**
 * Programmatic API for agent-doctor.
 * Use this when integrating agent-doctor into other tools or build pipelines.
 */

export { analyse, analyseAll } from './analyser/index.js';
export { loadConfig } from './config.js';
export { discoverFiles } from './discovery.js';
export { parseFile, parseMarkdown, parseMdc, parseSections } from './parser/index.js';
export { runStructuralAnalysis } from './analyser/structural.js';
export { analyseSemantics } from './analyser/semantic.js';
export { createAnthropicClient, createOpenAIClient, createClientFromConfig, inferProvider, resolveProvider } from './analyser/llm-client.js';
export { formatResult, formatResults, formatResultJson, formatResultsJson } from './output/formatter.js';
export { countTokens } from './tokens.js';

export type {
  AnalysisLayer,
  AnalysisResult,
  Config,
  FileType,
  Grade,
  Issue,
  LLMProvider,
  ParsedFile,
  RuleId,
  Section,
  Severity,
  StructuralRule,
} from './types.js';

export type { LLMClient } from './analyser/llm-client.js';

export { DEFAULT_CONFIG } from './types.js';
