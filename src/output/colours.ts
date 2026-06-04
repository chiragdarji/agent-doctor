import chalk from 'chalk';
import type { AnalysisResult, ReadinessDimensions } from '../types.js';

const DIM_KEYS: Array<keyof ReadinessDimensions> = [
  'observable',
  'bounded',
  'reversible',
  'tooled',
  'documented',
];

/** Averages a set of numbers, returning 100 for an empty array. */
export function avgNums(nums: number[]): number {
  if (nums.length === 0) return 100;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

/** Computes per-dimension averages across a set of AnalysisResults. */
export function avgDimensions(results: AnalysisResult[]): ReadinessDimensions {
  const dims = { observable: 100, bounded: 100, reversible: 100, tooled: 100, documented: 100 };
  for (const key of DIM_KEYS) {
    dims[key] = avgNums(results.map((r) => r.readinessDimensions[key]));
  }
  return dims;
}

/** Colours a grade letter consistently across all reporters. */
export function gradeColour(grade: string): string {
  if (grade === 'A') return chalk.green(grade);
  if (grade === 'B') return chalk.cyan(grade);
  if (grade === 'C') return chalk.yellow(grade);
  if (grade === 'D') return chalk.red(grade);
  return chalk.red.bold(grade);
}

/** Colours a numeric score string using shared thresholds (green ≥85, yellow ≥60, red). */
export function scoreColour(score: number, text?: string): string {
  const s = text ?? String(score);
  if (score >= 85) return chalk.green(s);
  if (score >= 60) return chalk.yellow(s);
  return chalk.red(s);
}
