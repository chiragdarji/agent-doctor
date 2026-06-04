import type { AnalysisResult, Grade } from '../types.js';

interface ShieldsEndpoint {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
}

/**
 * Produces a shields.io endpoint JSON badge for the worst result across all files.
 * Green ≥85, yellow ≥60, red below 60.
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

  const color = avgScore >= 85 ? 'brightgreen' : avgScore >= 60 ? 'yellow' : 'red';

  const badge: ShieldsEndpoint = {
    schemaVersion: 1,
    label: 'agent-doctor',
    message:
      results.length === 1
        ? `${worstGrade} · ${results[0]!.score}`
        : `${worstGrade} · ${avgScore} avg`,
    color,
  };

  return JSON.stringify(badge, null, 2);
}
