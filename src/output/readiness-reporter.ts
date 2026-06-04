import chalk, { type ChalkInstance } from 'chalk';
import { basename } from 'node:path';
import type { AnalysisResult, Issue, ReadinessDimensions } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BAR_WIDTH = 20;
const PASS_THRESHOLD = 85;
const WARN_THRESHOLD = 60;
const SEP = chalk.dim('─'.repeat(56));
const DOUBLE_SEP = chalk.dim('═'.repeat(56));

const DIMENSIONS: Array<{
  key: keyof ReadinessDimensions;
  label: string;
  passMsg: string;
  failMsg: string;
}> = [
  {
    key: 'observable',
    label: 'Observable',
    passMsg: 'All task outcomes have measurable completion signals.',
    failMsg: 'Some tasks lack verifiable success criteria — the agent cannot confirm completion.',
  },
  {
    key: 'bounded',
    label: 'Bounded',
    passMsg: 'Scope and task boundaries are well-defined.',
    failMsg: 'Scope or task boundaries are unclear — the agent may over- or under-reach.',
  },
  {
    key: 'reversible',
    label: 'Reversible',
    passMsg: 'Risky operations are guarded with recovery guidance.',
    failMsg: 'Destructive operations lack rollback steps — failures may be unrecoverable.',
  },
  {
    key: 'tooled',
    label: 'Tooled',
    passMsg: 'Available tools are enumerated and correctly described.',
    failMsg: 'Tool inventory is incomplete or contains inaccurate descriptions.',
  },
  {
    key: 'documented',
    label: 'Documented',
    passMsg: 'Instructions provide sufficient context for autonomous decisions.',
    failMsg: 'Context gaps may force the agent to make uninformed assumptions.',
  },
];

// Which rule IDs affect each dimension (mirrors READINESS_DEDUCTIONS in analyser/index.ts).
const DIMENSION_RULES: Record<keyof ReadinessDimensions, string[]> = {
  observable: ['unobservable-outcome', 'missing-success-criteria'],
  bounded: [
    'vague-boundary',
    'missing-fallback',
    'scope-bleed',
    'hardcoded-environment',
    'missing-success-criteria',
    'cross-file-conflict',
  ],
  reversible: ['missing-recovery-strategy', 'over-permissive'],
  tooled: ['missing-tool-list', 'tool-mismatch'],
  documented: ['todo-in-instructions', 'empty-section', 'ambiguous-pronoun', 'cross-file-conflict'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dimColour(score: number): ChalkInstance {
  if (score >= PASS_THRESHOLD) return chalk.green.bold;
  if (score >= WARN_THRESHOLD) return chalk.yellow.bold;
  return chalk.red.bold;
}

function bar(score: number): string {
  const filled = Math.round((score / 100) * BAR_WIDTH);
  return chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(BAR_WIDTH - filled));
}

function issueBlock(issue: Issue): string {
  const icon = issue.severity === 'critical' ? chalk.red('●') : chalk.yellow('●');
  const loc = issue.line !== undefined ? chalk.dim(` line ${issue.line}`) : '';
  return [
    `  ${icon}  ${chalk.bold(`[${issue.ruleId}]`)}${loc}`,
    `      ${issue.message}`,
    `      ${chalk.green('→')} ${issue.suggestion}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Formats a detailed agent readiness report from one or more AnalysisResults.
 * When multiple results are provided an aggregate summary is appended at the end.
 */
export function formatReadinessReport(results: AnalysisResult[]): string {
  if (results.length === 0) return '';

  const parts: string[] = results.map(reportForResult);

  if (results.length > 1) {
    parts.push(aggregateSection(results));
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Per-file report
// ---------------------------------------------------------------------------

function reportForResult(result: AnalysisResult): string {
  const lines: string[] = [];
  const rd = result.readinessDimensions;
  const isCrossFile = result.file === '<cross-file-analysis>';
  const fileLabel = isCrossFile ? 'cross-file analysis' : basename(result.file);

  lines.push('');
  lines.push(chalk.bold.underline(`Agent Readiness Report  —  ${fileLabel}`));
  lines.push(
    `Overall Readiness  ` +
      `${dimColour(result.readinessScore)(`${result.readinessScore} / 100`)}  ` +
      chalk.dim(`(Health: ${result.score}/100  Grade: ${result.grade})`),
  );
  lines.push('');

  // Compact summary table
  for (const { key, label } of DIMENSIONS) {
    const score = rd[key];
    const icon = score >= PASS_THRESHOLD ? chalk.green('✓') : chalk.yellow('⚠');
    const scoreStr = dimColour(score)(`${String(score).padStart(3)}/100`);
    lines.push(`  ${icon}  ${chalk.bold(label.padEnd(12))}  ${scoreStr}  ${bar(score)}`);
  }
  lines.push('');

  // Per-dimension detail sections
  for (const { key, label, passMsg, failMsg } of DIMENSIONS) {
    const score = rd[key];
    lines.push(SEP);
    lines.push(dimColour(score)(`${label}  ${score}/100`));

    if (score >= PASS_THRESHOLD) {
      lines.push(chalk.green(`✓  ${passMsg}`));
    } else {
      lines.push(chalk.yellow(`⚠  ${failMsg}`));
      const relevant = result.issues.filter((i) => DIMENSION_RULES[key].includes(i.ruleId));
      if (relevant.length > 0) {
        lines.push('');
        lines.push(...relevant.map(issueBlock));
      } else {
        lines.push(chalk.dim('  (No active issues in this dimension.)'));
      }
    }
    lines.push('');
  }

  lines.push(SEP);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Aggregate section (multi-file)
// ---------------------------------------------------------------------------

function aggregateSection(results: AnalysisResult[]): string {
  const lines: string[] = [];

  const avg = (key: keyof ReadinessDimensions): number =>
    Math.round(results.reduce((s, r) => s + r.readinessDimensions[key], 0) / results.length);

  const avgReadiness = Math.round(
    results.reduce((s, r) => s + r.readinessScore, 0) / results.length,
  );

  lines.push(DOUBLE_SEP);
  lines.push(chalk.bold(`Aggregate Readiness — ${results.length} files`));
  lines.push(`Overall  ${dimColour(avgReadiness)(`${avgReadiness} / 100`)}`);
  lines.push('');

  for (const { key, label } of DIMENSIONS) {
    const score = avg(key);
    lines.push(
      `  ${dimColour(score)(label.padEnd(12))}  ${dimColour(score)(`${String(score).padStart(3)}/100`)}  ${bar(score)}`,
    );
  }

  lines.push(DOUBLE_SEP);
  return lines.join('\n');
}
