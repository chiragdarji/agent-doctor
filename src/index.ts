/**
 * Programmatic API for agent-doctor.
 * Use this when integrating agent-doctor into other tools or build pipelines.
 */

export { analyse, analyseAll } from './analyser/index.js';
export { loadConfig } from './config.js';
export { discoverFiles } from './discovery.js';
export { parseFile, parseMarkdown, parseMdc, parseSections } from './parser/index.js';
export { runStructuralAnalysis } from './analyser/structural.js';
export { formatResult, formatResults, formatResultJson, formatResultsJson } from './output/formatter.js';
export { countTokens } from './tokens.js';

export type {
  AnalysisLayer,
  AnalysisResult,
  Config,
  FileType,
  Grade,
  Issue,
  ParsedFile,
  RuleId,
  Section,
  Severity,
  StructuralRule,
} from './types.js';

export { DEFAULT_CONFIG } from './types.js';
