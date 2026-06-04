import chalk from 'chalk';
import { scoreColour, gradeColour } from './colours.js';
import type { AnalysisResult, Issue } from '../types.js';

function issueKey(issue: Issue): string {
  return `${issue.ruleId}:${issue.line ?? 0}`;
}

/**
 * Formats a side-by-side comparison of two analysis results.
 * Shows score delta, new issues, resolved issues, and unchanged issues.
 */
export function formatCompare(
  before: AnalysisResult,
  after: AnalysisResult,
  beforeLabel: string,
  afterLabel: string,
): string {
  const lines: string[] = [];
  const scoreDelta = after.score - before.score;
  const rdnsDelta = after.readinessScore - before.readinessScore;

  const deltaStr = (d: number): string =>
    d > 0 ? chalk.green(`↑${d}`) : d < 0 ? chalk.red(`↓${Math.abs(d)}`) : chalk.dim('→0');

  lines.push('');
  lines.push(chalk.bold(`Compare: ${beforeLabel}  →  ${afterLabel}`));
  lines.push('');
  lines.push(
    `  Score:     ${scoreColour(before.score, String(before.score).padStart(3))}  →  ${scoreColour(after.score, String(after.score).padStart(3))}  ${deltaStr(scoreDelta)}`,
  );
  lines.push(`  Grade:     ${gradeColour(before.grade)}  →  ${gradeColour(after.grade)}`);
  lines.push(
    `  Readiness: ${scoreColour(before.readinessScore, String(before.readinessScore).padStart(3))}  →  ${scoreColour(after.readinessScore, String(after.readinessScore).padStart(3))}  ${deltaStr(rdnsDelta)}`,
  );
  lines.push('');

  const beforeKeys = new Map(before.issues.map((i) => [issueKey(i), i]));
  const afterKeys = new Map(after.issues.map((i) => [issueKey(i), i]));

  const newIssues = after.issues.filter((i) => !beforeKeys.has(issueKey(i)));
  const resolved = before.issues.filter((i) => !afterKeys.has(issueKey(i)));
  const unchanged = after.issues.filter((i) => beforeKeys.has(issueKey(i)));

  if (newIssues.length > 0) {
    lines.push(chalk.red.bold(`New issues (${newIssues.length})`));
    for (const issue of newIssues) {
      const loc = issue.line ? chalk.dim(` line ${issue.line}`) : '';
      lines.push(`  ${chalk.red('+')} ${chalk.dim(issue.ruleId)}${loc}  ${issue.message}`);
    }
    lines.push('');
  }

  if (resolved.length > 0) {
    lines.push(chalk.green.bold(`Resolved (${resolved.length})`));
    for (const issue of resolved) {
      lines.push(`  ${chalk.green('✓')} ${chalk.dim(issue.ruleId)}  ${issue.message}`);
    }
    lines.push('');
  }

  if (unchanged.length > 0) {
    lines.push(chalk.dim(`Unchanged (${unchanged.length})`));
    for (const issue of unchanged) {
      const loc = issue.line ? chalk.dim(` line ${issue.line}`) : '';
      lines.push(chalk.dim(`  · ${issue.ruleId}${loc}`));
    }
    lines.push('');
  }

  if (newIssues.length === 0 && resolved.length === 0) {
    lines.push(chalk.dim('No change in issues.'));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Serialises a comparison to JSON.
 */
export function formatCompareJson(
  before: AnalysisResult,
  after: AnalysisResult,
  beforeLabel: string,
  afterLabel: string,
): string {
  const beforeKeys = new Map(before.issues.map((i) => [issueKey(i), i]));
  const afterKeys = new Map(after.issues.map((i) => [issueKey(i), i]));

  return JSON.stringify(
    {
      before: {
        label: beforeLabel,
        score: before.score,
        grade: before.grade,
        readinessScore: before.readinessScore,
      },
      after: {
        label: afterLabel,
        score: after.score,
        grade: after.grade,
        readinessScore: after.readinessScore,
      },
      delta: {
        score: after.score - before.score,
        readinessScore: after.readinessScore - before.readinessScore,
      },
      newIssues: after.issues.filter((i) => !beforeKeys.has(issueKey(i))),
      resolved: before.issues.filter((i) => !afterKeys.has(issueKey(i))),
      unchanged: after.issues.filter((i) => beforeKeys.has(issueKey(i))),
    },
    null,
    2,
  );
}
