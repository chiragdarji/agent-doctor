import type { AnalysisResult, Grade } from '../types.js';

interface ShieldsEndpoint {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
}

/**
 * Produces a shields.io endpoint JSON badge for the worst result across all files.
 *
 * Message format: "pass · A · 97" or "2 issues · C · 64"
 * Color: brightgreen (≥85), yellow (≥60), red (<60).
 */
export function formatBadge(results: AnalysisResult[]): string {
  if (results.length === 0) {
    return JSON.stringify(
      { schemaVersion: 1, label: 'agent-doctor', message: 'no files', color: 'lightgrey' },
      null,
      2,
    );
  }

  // Use worst score/grade across all results
  const GRADE_ORDER: Grade[] = ['A', 'B', 'C', 'D', 'F'];
  const worstGrade = results.reduce<Grade>(
    (worst, r) =>
      GRADE_ORDER.indexOf(r.grade) > GRADE_ORDER.indexOf(worst) ? r.grade : worst,
    'A',
  );
  const avgScore = Math.round(
    results.reduce((sum, r) => sum + r.score, 0) / results.length,
  );
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);

  const color = avgScore >= 85 ? 'brightgreen' : avgScore >= 60 ? 'yellow' : 'red';
  const statusLabel = totalIssues === 0 ? 'pass' : `${totalIssues} issue${totalIssues > 1 ? 's' : ''}`;
  const scoreDisplay = results.length === 1 ? `${results[0]!.score}` : `${avgScore} avg`;

  const badge: ShieldsEndpoint = {
    schemaVersion: 1,
    label: 'agent-doctor',
    message: `${statusLabel} · ${worstGrade} · ${scoreDisplay}`,
    color,
  };

  return JSON.stringify(badge, null, 2);
}
