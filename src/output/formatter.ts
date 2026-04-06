import chalk, { type ChalkInstance } from 'chalk';
import { basename } from 'node:path';
import type { AnalysisResult, Grade, Issue, Severity } from '../types.js';

const SEPARATOR = chalk.dim('─'.repeat(44));

const SEVERITY_ICON: Record<Severity, string> = {
  critical: '❌',
  warning: '⚠ ',
  suggestion: '💡',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'CRITICAL',
  warning: 'WARNING ',
  suggestion: 'SUGGEST ',
};

function severityColour(severity: Severity): ChalkInstance {
  switch (severity) {
    case 'critical':
      return chalk.red.bold;
    case 'warning':
      return chalk.yellow.bold;
    case 'suggestion':
      return chalk.cyan.bold;
  }
}

function gradeColour(grade: Grade): ChalkInstance {
  switch (grade) {
    case 'A':
      return chalk.green.bold;
    case 'B':
      return chalk.greenBright.bold;
    case 'C':
      return chalk.yellow.bold;
    case 'D':
      return chalk.red;
    case 'F':
      return chalk.red.bold;
  }
}

function scoreColour(score: number): ChalkInstance {
  if (score >= 90) return chalk.green.bold;
  if (score >= 75) return chalk.greenBright.bold;
  if (score >= 60) return chalk.yellow.bold;
  if (score >= 40) return chalk.red;
  return chalk.red.bold;
}

function formatIssue(issue: Issue): string {
  const colour = severityColour(issue.severity);
  const icon = SEVERITY_ICON[issue.severity];
  const label = SEVERITY_LABEL[issue.severity];

  const header = colour(`${icon}  ${label}  ${issue.ruleId}`);
  const loc = issue.line !== undefined ? chalk.dim(` (line ${issue.line})`) : '';
  const message = `    ${issue.message}${loc}`;
  const suggestion = chalk.green(`    → ${issue.suggestion}`);

  const parts = [header, message, suggestion];

  if (issue.context !== undefined && issue.context !== issue.message) {
    parts.splice(1, 0, chalk.dim(`    "${issue.context}"`));
  }

  return parts.join('\n');
}

/**
 * Formats an AnalysisResult as a human-readable console string.
 */
export function formatResult(result: AnalysisResult): string {
  const lines: string[] = [];
  const file = basename(result.file);

  lines.push('');
  lines.push(chalk.bold(`agent-doctor 🩺  Analysing ${file}...`));
  lines.push('');

  if (result.issues.length === 0) {
    lines.push(chalk.green.bold('✓  No issues found'));
  } else {
    const ordered: Severity[] = ['critical', 'warning', 'suggestion'];
    for (const sev of ordered) {
      const group = result.issues.filter((i) => i.severity === sev);
      for (const issue of group) {
        lines.push(formatIssue(issue));
        lines.push('');
      }
    }
  }

  // Summary footer
  const criticals = result.issues.filter((i) => i.severity === 'critical').length;
  const warnings = result.issues.filter((i) => i.severity === 'warning').length;
  const suggestions = result.issues.filter((i) => i.severity === 'suggestion').length;

  const issueParts: string[] = [];
  if (criticals > 0) issueParts.push(chalk.red.bold(`${criticals} critical`));
  if (warnings > 0) issueParts.push(chalk.yellow(`${warnings} warning${warnings > 1 ? 's' : ''}`));
  if (suggestions > 0)
    issueParts.push(chalk.cyan(`${suggestions} suggestion${suggestions > 1 ? 's' : ''}`));
  const issueSummary = issueParts.length > 0 ? issueParts.join(chalk.dim(' · ')) : 'none';

  const scoreStr = scoreColour(result.score)(`${result.score} / 100`);
  const gradeStr = gradeColour(result.grade)(result.grade);

  lines.push(SEPARATOR);
  lines.push(`Health Score  ${scoreStr}  (${gradeStr})`);
  lines.push(`Issues        ${issueSummary}`);
  lines.push(`Files         ${result.file}`);
  if (result.layers.includes('semantic')) {
    lines.push(`Model         ${process.env['AGENT_DOCTOR_MODEL'] ?? 'claude-sonnet-4-6'}`);
  }
  lines.push(SEPARATOR);

  return lines.join('\n');
}

/**
 * Formats multiple AnalysisResults separated by blank lines.
 */
export function formatResults(results: AnalysisResult[]): string {
  return results.map(formatResult).join('\n');
}

/**
 * Formats an AnalysisResult as pretty-printed JSON.
 */
export function formatResultJson(result: AnalysisResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Formats multiple AnalysisResults as a JSON array.
 */
export function formatResultsJson(results: AnalysisResult[]): string {
  return JSON.stringify(results, null, 2);
}
