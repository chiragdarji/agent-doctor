/**
 * Programmatic API for agent-doctor.
 * Use this when integrating agent-doctor into other tools or build pipelines.
 */

export { analyse, analyseAll } from './analyser/index.js';
export { loadPlugins } from './plugin-loader.js';
export { applyFixes } from './fixer.js';
export type { FixResult } from './fixer.js';
export { initFile, templateFor } from './init.js';
export type { InitType, InitOptions, InitResult } from './init.js';
export { loadConfig } from './config.js';
export { discoverFiles, discoverOrgFiles } from './discovery.js';
export { parseFile, parseMarkdown, parseMdc, parseSections } from './parser/index.js';
export { runStructuralAnalysis } from './analyser/structural.js';
export { analyseSemantics } from './analyser/semantic.js';
export { createAnthropicClient, createOpenAIClient, createOpenAICompatibleClient, createClientFromConfig, inferProvider, resolveProvider } from './analyser/llm-client.js';
export { formatResult, formatResults, formatResultJson, formatResultsJson } from './output/formatter.js';
export { formatReadinessReport } from './output/readiness-reporter.js';
export { runHistory } from './analyser/history.js';
export { detectPlatform, applyPlatformOverrides } from './analyser/platform.js';
export type { TargetPlatform } from './analyser/platform.js';
export { formatHistory, formatHistoryJson } from './output/history-reporter.js';
export { formatOrgReport, formatOrgReportJson } from './output/org-reporter.js';
export type { HistoryEntry } from './analyser/history.js';
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
  PluginRule,
  RuleId,
  Section,
  Severity,
  StructuralRule,
} from './types.js';

export type { LLMClient } from './analyser/llm-client.js';

export { DEFAULT_CONFIG } from './types.js';
