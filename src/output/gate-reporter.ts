import type { AnalysisResult, Issue, Severity } from '../types.js';

export interface GateResult {
  passed: boolean;
  score: number;
  grade: string;
  readinessScore: number;
  blockedBy: Issue[];
  file: string;
}

export interface OrgGateResult {
  passed: boolean;
  files: GateResult[];
  blockedFiles: number;
  totalFiles: number;
}

function severityRank(s: Severity): number {
  return s === 'critical' ? 3 : s === 'warning' ? 2 : 1;
}

/**
 * Evaluates a single analysis result against the failOn threshold and returns
 * a structured gate result suitable for programmatic consumption by orchestrators.
 */
export function evaluateGate(result: AnalysisResult, failOn: Severity): GateResult {
  const blockedBy = result.issues.filter(
    (i) => severityRank(i.severity) >= severityRank(failOn),
  );
  return {
    passed: blockedBy.length === 0,
    score: result.score,
    grade: result.grade,
    readinessScore: result.readinessScore,
    blockedBy,
    file: result.file,
  };
}

/**
 * Formats a single-file gate result as JSON for orchestrator consumption.
 */
export function formatGateJson(result: AnalysisResult, failOn: Severity): string {
  return JSON.stringify(evaluateGate(result, failOn), null, 2);
}

/**
 * Formats an org-level gate result across multiple files.
 */
export function formatOrgGateJson(results: AnalysisResult[], failOn: Severity): string {
  const files = results.map((r) => evaluateGate(r, failOn));
  const out: OrgGateResult = {
    passed: files.every((f) => f.passed),
    files,
    blockedFiles: files.filter((f) => !f.passed).length,
    totalFiles: files.length,
  };
  return JSON.stringify(out, null, 2);
}
