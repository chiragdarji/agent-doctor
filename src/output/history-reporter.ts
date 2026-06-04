import chalk from 'chalk';
import type { HistoryEntry } from '../analyser/history.js';

function gradeColour(grade: string): string {
  if (grade === 'A') return chalk.green(grade);
  if (grade === 'B') return chalk.cyan(grade);
  if (grade === 'C') return chalk.yellow(grade);
  if (grade === 'D') return chalk.magenta(grade);
  return chalk.red(grade);
}

function scoreTrend(entries: HistoryEntry[]): string {
  if (entries.length < 2) return '';
  const first = entries[entries.length - 1]!.score;
  const last = entries[0]!.score;
  const delta = last - first;
  if (delta > 0) return chalk.green(` ↑${delta}`);
  if (delta < 0) return chalk.red(` ↓${Math.abs(delta)}`);
  return chalk.dim(' →0');
}

/**
 * Formats the history entries as a human-readable table for terminal output.
 */
export function formatHistory(entries: HistoryEntry[], filePath: string): string {
  if (entries.length === 0) {
    return chalk.yellow(`No git history found for ${filePath}`);
  }

  const lines: string[] = [];
  lines.push('');
  lines.push(chalk.bold(`Score history — ${filePath}`) + scoreTrend(entries));
  lines.push('');

  const COL = {
    commit: 7,
    date: 10,
    score: 5,
    grade: 5,
    readiness: 9,
    issues: 6,
    subject: 40,
  };

  const header = [
    chalk.dim('COMMIT '.padEnd(COL.commit + 1)),
    chalk.dim('DATE       '),
    chalk.dim('SCORE'),
    chalk.dim(' GRD'),
    chalk.dim(' RDNS'),
    chalk.dim(' ISSUES'),
    chalk.dim(' SUBJECT'),
  ].join('');
  lines.push(header);
  lines.push(chalk.dim('─'.repeat(80)));

  for (const entry of entries) {
    const scoreStr = String(entry.score).padStart(COL.score);
    const scoreColoured =
      entry.score >= 90
        ? chalk.green(scoreStr)
        : entry.score >= 75
          ? chalk.cyan(scoreStr)
          : entry.score >= 60
            ? chalk.yellow(scoreStr)
            : chalk.red(scoreStr);

    const issueStr =
      entry.criticalCount > 0
        ? chalk.red(String(entry.issueCount).padStart(COL.issues))
        : entry.warningCount > 0
          ? chalk.yellow(String(entry.issueCount).padStart(COL.issues))
          : chalk.green(String(entry.issueCount).padStart(COL.issues));

    const subjectTrunc =
      entry.subject.length > COL.subject
        ? entry.subject.slice(0, COL.subject - 1) + '…'
        : entry.subject;

    lines.push(
      `${chalk.dim(entry.commit)}  ${chalk.dim(entry.date)}  ${scoreColoured}  ${gradeColour(entry.grade)}  ${String(entry.readinessScore).padStart(COL.readiness)}  ${issueStr}  ${chalk.dim(subjectTrunc)}`,
    );
  }

  lines.push('');
  lines.push(
    chalk.dim(
      `${entries.length} commit${entries.length !== 1 ? 's' : ''} · structural analysis only`,
    ),
  );
  lines.push('');

  return lines.join('\n');
}

/**
 * Serialises the history entries to a JSON string suitable for CI integration.
 */
export function formatHistoryJson(entries: HistoryEntry[], filePath: string): string {
  return JSON.stringify({ file: filePath, history: entries }, null, 2);
}
