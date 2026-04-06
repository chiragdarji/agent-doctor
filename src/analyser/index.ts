import { parseFile } from '../parser/index.js';
import { runStructuralAnalysis } from './structural.js';
import { analyseSemantics } from './semantic.js';
import type { AnalysisLayer, AnalysisResult, Config, Grade, Issue, Severity } from '../types.js';

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

  return {
    file: filePath,
    score,
    grade: calculateGrade(score),
    issues,
    tokenCount: parsed.tokenCount,
    analysedAt: new Date().toISOString(),
    layers: usedLayers,
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
