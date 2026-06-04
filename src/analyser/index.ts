import { parseFile } from '../parser/index.js';
import { runStructuralAnalysis } from './structural.js';
import { analyseSemantics } from './semantic.js';
import { multiFileSemantics } from './multi-file-semantic.js';
import { loadPlugins } from '../plugin-loader.js';
import type { FileContent } from './multi-file-semantic.js';
import type { LLMClient } from './llm-client.js';
import type {
  AnalysisLayer,
  AnalysisResult,
  Config,
  Grade,
  Issue,
  PluginRule,
  ReadinessDimensions,
  RuleId,
  Severity,
} from '../types.js';

/**
 * Analyses a single instruction file and returns a full AnalysisResult.
 * Runs the layers specified in `config.layers`. Plugins from `config.plugins`
 * are loaded on first call (Node's module cache prevents redundant re-imports).
 */
export async function analyse(filePath: string, config: Config): Promise<AnalysisResult> {
  const pluginRules = await loadPlugins(config.plugins, process.cwd());
  return _analyse(filePath, config, pluginRules);
}

/**
 * Analyses multiple files and returns one AnalysisResult per file.
 * Plugins are loaded once and reused for every file.
 */
export async function analyseAll(
  filePaths: string[],
  config: Config,
): Promise<AnalysisResult[]> {
  const pluginRules = await loadPlugins(config.plugins, process.cwd());
  return Promise.all(filePaths.map((fp) => _analyse(fp, config, pluginRules)));
}

async function _analyse(
  filePath: string,
  config: Config,
  pluginRules: PluginRule[],
): Promise<AnalysisResult> {
  const parsed = parseFile(filePath);
  const issues: Issue[] = [];
  const usedLayers: AnalysisLayer[] = [];

  if (config.layers.includes('structural')) {
    issues.push(...runStructuralAnalysis(parsed, config, pluginRules));
    usedLayers.push('structural');
  }

  if (config.layers.includes('semantic')) {
    const semanticIssues = await analyseSemantics(parsed.content, filePath, config);
    const filtered = semanticIssues.filter((i) => config.rules[i.ruleId] !== 'off');
    issues.push(...filtered);
    usedLayers.push('semantic');
  }

  const score = calculateScore(issues);
  const { readinessScore, readinessDimensions } = computeReadiness(issues);

  return {
    file: filePath,
    score,
    grade: calculateGrade(score),
    issues,
    tokenCount: parsed.tokenCount,
    analysedAt: new Date().toISOString(),
    layers: usedLayers,
    readinessScore,
    readinessDimensions,
  };
}

/**
 * Runs cross-file semantic analysis on 2+ already-parsed files, returning a
 * synthetic AnalysisResult scoped to the set of files. Returns null when:
 *   - fewer than 2 files are provided
 *   - semantic layer is not in config.layers
 *   - no conflicts are detected
 *
 * @param files  - File paths + content pairs (use parseFile() to populate content).
 * @param config - Analysis configuration.
 * @param client - Optional injected LLMClient (for tests).
 */
export async function analyseCrossFile(
  files: FileContent[],
  config: Config,
  client?: LLMClient,
): Promise<AnalysisResult | null> {
  if (files.length < 2) return null;
  if (!config.layers.includes('semantic')) return null;

  const issues = await multiFileSemantics(files, config, client);
  const filtered = issues.filter((i) => config.rules[i.ruleId] !== 'off');
  if (filtered.length === 0) return null;

  const score = calculateScore(filtered);
  const { readinessScore, readinessDimensions } = computeReadiness(filtered);

  return {
    file: '<cross-file-analysis>',
    score,
    grade: calculateGrade(score),
    issues: filtered,
    tokenCount: 0,
    analysedAt: new Date().toISOString(),
    layers: ['semantic'],
    readinessScore,
    readinessDimensions,
  };
}

function calculateScore(issues: Issue[]): number {
  const deductions: Record<Severity, number> = {
    critical: 20,
    warning: 10,
    suggestion: 3,
  };

  const total = issues.reduce((acc, issue) => acc + deductions[issue.severity], 0);
  return Math.max(0, 100 - total);
}

function calculateGrade(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

// Deduction per rule per readiness dimension (Factory.ai + OpenAI Harness framework).
// Each dimension starts at 100; deductions are summed and clamped to 0.
const READINESS_DEDUCTIONS: Partial<
  Record<RuleId, Partial<Record<keyof ReadinessDimensions, number>>>
> = {
  'unobservable-outcome': { observable: 25 },
  'missing-success-criteria': { observable: 20, bounded: 10 },
  'vague-boundary': { bounded: 15 },
  'missing-fallback': { bounded: 20 },
  'scope-bleed': { bounded: 20 },
  'hardcoded-environment': { bounded: 15 },
  'missing-recovery-strategy': { reversible: 25 },
  'over-permissive': { reversible: 20 },
  'missing-tool-list': { tooled: 20 },
  'tool-mismatch': { tooled: 25 },
  'todo-in-instructions': { documented: 20 },
  'empty-section': { documented: 10 },
  'ambiguous-pronoun': { documented: 10 },
  'cross-file-conflict': { bounded: 15, documented: 10 },
};

/**
 * Derives a readiness score and per-dimension breakdown from the collected issues.
 * No additional API calls — computed entirely from the rule findings.
 */
export function computeReadiness(issues: Issue[]): {
  readinessScore: number;
  readinessDimensions: ReadinessDimensions;
} {
  const dims: ReadinessDimensions = {
    observable: 100,
    bounded: 100,
    reversible: 100,
    tooled: 100,
    documented: 100,
  };

  for (const issue of issues) {
    const deductions = READINESS_DEDUCTIONS[issue.ruleId];
    if (!deductions) continue;
    for (const [dim, amount] of Object.entries(deductions) as [
      keyof ReadinessDimensions,
      number,
    ][]) {
      dims[dim] = Math.max(0, dims[dim] - amount);
    }
  }

  const readinessScore = Math.round(
    (dims.observable + dims.bounded + dims.reversible + dims.tooled + dims.documented) / 5,
  );

  return { readinessScore, readinessDimensions: dims };
}
