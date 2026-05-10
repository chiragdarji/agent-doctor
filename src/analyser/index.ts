import { parseFile } from '../parser/index.js';
import { runStructuralAnalysis } from './structural.js';
import { analyseSemantics } from './semantic.js';
import type {
  AnalysisLayer,
  AnalysisResult,
  Config,
  Grade,
  Issue,
  ReadinessDimensions,
  RuleId,
  Severity,
} from '../types.js';

/**
 * Analyses a single instruction file and returns a full AnalysisResult.
 * Runs the layers specified in `config.layers`.
 */
export async function analyse(filePath: string, config: Config): Promise<AnalysisResult> {
  const parsed = parseFile(filePath);
  const issues: Issue[] = [];
  const usedLayers: AnalysisLayer[] = [];

  if (config.layers.includes('structural')) {
    issues.push(...runStructuralAnalysis(parsed, config));
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
 * Analyses multiple files and returns one AnalysisResult per file.
 */
export async function analyseAll(
  filePaths: string[],
  config: Config,
): Promise<AnalysisResult[]> {
  return Promise.all(filePaths.map((fp) => analyse(fp, config)));
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
