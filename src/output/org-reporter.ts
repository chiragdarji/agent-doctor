import chalk from 'chalk';
import { basename, relative } from 'node:path';
import { avgNums, avgDimensions, scoreColour } from './colours.js';
import type { AnalysisResult, Grade, ReadinessDimensions } from '../types.js';

interface FileGroup {
  label: string;
  results: AnalysisResult[];
  avgScore: number;
  avgReadiness: number;
  avgDims: ReadinessDimensions;
  grades: Record<Grade, number>;
}

function gradeCount(grade: string, count: number): string {
  if (count === 0) return chalk.dim('0');
  if (grade === 'A') return chalk.green(String(count));
  if (grade === 'B') return chalk.cyan(String(count));
  if (grade === 'C') return chalk.yellow(String(count));
  return chalk.red(String(count));
}

function scoreBar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  if (score >= 85) return chalk.green(bar);
  if (score >= 60) return chalk.yellow(bar);
  return chalk.red(bar);
}

function fileTypeLabel(filePath: string): string {
  const base = basename(filePath);
  if (/^claude\.md$/i.test(base)) return 'CLAUDE.md';
  if (/^agents\.md$/i.test(base)) return 'AGENTS.md';
  if (/^gemini\.md$/i.test(base)) return 'GEMINI.md';
  if (base.endsWith('.mdc')) return '.mdc';
  if (base === 'copilot-instructions.md') return 'copilot-instructions.md';
  if (/^\.windsurfrules$/i.test(base)) return '.windsurfrules';
  if (base.endsWith('.md') && filePath.includes('.roo/rules/')) return '.roo rule';
  return base;
}

function groupByType(results: AnalysisResult[]): FileGroup[] {
  const map = new Map<string, AnalysisResult[]>();
  for (const r of results) {
    const label = fileTypeLabel(r.file);
    const group = map.get(label) ?? [];
    group.push(r);
    map.set(label, group);
  }

  return Array.from(map.entries()).map(([label, res]) => {
    const grades: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const r of res) grades[r.grade]++;
    return {
      label,
      results: res,
      avgScore: avgNums(res.map((r) => r.score)),
      avgReadiness: avgNums(res.map((r) => r.readinessScore)),
      avgDims: avgDimensions(res),
      grades,
    };
  });
}

function formatDimensionRow(label: string, score: number): string {
  const padded = label.padEnd(12);
  const num = String(score).padStart(3);
  return `  ${chalk.dim(padded)} ${scoreBar(score, 12)} ${num}`;
}

/**
 * Formats the org-level health dashboard as a human-readable terminal report.
 */
export function formatOrgReport(
  results: AnalysisResult[],
  root: string,
): string {
  if (results.length === 0) {
    return chalk.yellow('No agent instruction files found in this workspace.');
  }

  const lines: string[] = [];
  lines.push('');
  lines.push(chalk.bold(`Org Health Dashboard — ${relative(process.cwd(), root) || '.'}`));
  lines.push(chalk.dim(`${results.length} file${results.length !== 1 ? 's' : ''} analysed`));
  lines.push('');

  const groups = groupByType(results);

  // Summary table header
  lines.push(
    chalk.dim(
      `${'TYPE'.padEnd(26)}${'FILES'.padStart(6)}  ${'AVG SCORE'.padEnd(10)}${'AVG RDNS'.padEnd(10)}${'A'.padStart(3)}${'B'.padStart(3)}${'C'.padStart(3)}${'D'.padStart(3)}${'F'.padStart(3)}`,
    ),
  );
  lines.push(chalk.dim('─'.repeat(72)));

  for (const g of groups) {
    const scoreStr = scoreColour(g.avgScore, String(g.avgScore).padStart(3));
    const rdnsStr = scoreColour(g.avgReadiness, String(g.avgReadiness).padStart(3));

    lines.push(
      `${g.label.padEnd(26)}${String(g.results.length).padStart(6)}  ${scoreStr}${''.padEnd(7)}${rdnsStr}${''.padEnd(7)}${gradeCount('A', g.grades.A).padStart(3)}${gradeCount('B', g.grades.B).padStart(3)}${gradeCount('C', g.grades.C).padStart(3)}${gradeCount('D', g.grades.D).padStart(3)}${gradeCount('F', g.grades.F).padStart(3)}`,
    );
  }

  lines.push('');

  // Overall aggregate
  const overall: FileGroup = {
    label: 'ALL',
    results,
    avgScore: avgNums(results.map((r) => r.score)),
    avgReadiness: avgNums(results.map((r) => r.readinessScore)),
    avgDims: avgDimensions(results),
    grades: { A: 0, B: 0, C: 0, D: 0, F: 0 },
  };
  for (const r of results) overall.grades[r.grade]++;

  lines.push(chalk.bold('Overall readiness dimensions'));
  lines.push('');
  lines.push(formatDimensionRow('Observable', overall.avgDims.observable));
  lines.push(formatDimensionRow('Bounded', overall.avgDims.bounded));
  lines.push(formatDimensionRow('Reversible', overall.avgDims.reversible));
  lines.push(formatDimensionRow('Tooled', overall.avgDims.tooled));
  lines.push(formatDimensionRow('Documented', overall.avgDims.documented));
  lines.push('');
  lines.push(
    chalk.bold('Overall avg score: ') +
      scoreColour(overall.avgScore) +
      chalk.dim('  |  ') +
      chalk.bold('Avg readiness: ') +
      scoreColour(overall.avgReadiness),
  );
  lines.push('');

  // Per-file detail (compact)
  lines.push(chalk.bold('Files'));
  lines.push('');
  for (const r of results) {
    const rel = relative(root, r.file) || basename(r.file);
    const scoreStr = scoreColour(r.score, String(r.score).padStart(3));
    const issueStr =
      r.issues.length === 0
        ? chalk.green('✓')
        : chalk.yellow(`${r.issues.length} issue${r.issues.length !== 1 ? 's' : ''}`);
    lines.push(`  ${scoreStr}  ${chalk.dim(r.grade)}  ${issueStr.padEnd(10)}  ${rel}`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Serialises org results to JSON for CI/dashboard tooling.
 */
export function formatOrgReportJson(
  results: AnalysisResult[],
  root: string,
): string {
  const groups = groupByType(results);
  const allDims = avgDimensions(results);

  return JSON.stringify(
    {
      root,
      fileCount: results.length,
      avgScore: avgNums(results.map((r) => r.score)),
      avgReadiness: avgNums(results.map((r) => r.readinessScore)),
      avgDimensions: allDims,
      byType: groups.map((g) => ({
        type: g.label,
        count: g.results.length,
        avgScore: g.avgScore,
        avgReadiness: g.avgReadiness,
        avgDimensions: g.avgDims,
        grades: g.grades,
      })),
      files: results.map((r) => ({
        file: relative(root, r.file) || basename(r.file),
        score: r.score,
        grade: r.grade,
        readinessScore: r.readinessScore,
        issueCount: r.issues.length,
      })),
    },
    null,
    2,
  );
}
