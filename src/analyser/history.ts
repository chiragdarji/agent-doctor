import { execSync } from 'node:child_process';
import { extname, dirname, relative, resolve } from 'node:path';
import { parseMarkdownContent } from '../parser/markdown.js';
import { parseMdcContent } from '../parser/mdc.js';
import { runStructuralAnalysis } from './structural.js';
import { calculateScore, calculateGrade, computeReadiness } from './index.js';
import type { Config, Grade } from '../types.js';

export interface HistoryEntry {
  commit: string;
  date: string;
  subject: string;
  score: number;
  grade: Grade;
  issueCount: number;
  criticalCount: number;
  warningCount: number;
  readinessScore: number;
}

/**
 * Walks the last `n` git commits that modified `filePath` and returns a score
 * trend table based on structural analysis only (no LLM calls).
 *
 * Throws if the current directory is not a git repository.
 */
export async function runHistory(
  filePath: string,
  config: Config,
  n: number = 10,
): Promise<HistoryEntry[]> {
  const absPath = resolve(process.cwd(), filePath);
  // Detect the git root from the file's own directory so fixture repos in /tmp work too
  const fileDir = dirname(absPath);

  let gitRoot: string;
  try {
    gitRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      cwd: fileDir,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    throw new Error('Not a git repository — --history requires git');
  }

  const gitRelPath = relative(gitRoot, absPath);

  let logOutput: string;
  try {
    logOutput = execSync(
      `git log --format="%H|%ai|%s" -n ${n} -- "${gitRelPath}"`,
      { encoding: 'utf8', cwd: gitRoot, stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
  } catch {
    throw new Error(`Failed to read git log for ${filePath}`);
  }

  if (!logOutput) return [];

  const isMdc = extname(filePath).toLowerCase() === '.mdc';
  const structuralConfig = { ...config, layers: ['structural'] as Config['layers'] };
  const entries: HistoryEntry[] = [];

  for (const line of logOutput.split('\n')) {
    if (!line.trim()) continue;
    const pipeIdx = line.indexOf('|');
    const pipe2Idx = line.indexOf('|', pipeIdx + 1);
    if (pipeIdx < 0 || pipe2Idx < 0) continue;

    const hash = line.slice(0, pipeIdx);
    const dateRaw = line.slice(pipeIdx + 1, pipe2Idx);
    const subject = line.slice(pipe2Idx + 1).trim();
    const date = dateRaw.split(' ')[0] ?? dateRaw;

    let rawContent: string;
    try {
      rawContent = execSync(`git show "${hash}":"${gitRelPath}"`, {
        encoding: 'utf8',
        cwd: gitRoot,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      continue;
    }

    const parsed = isMdc
      ? parseMdcContent(filePath, rawContent)
      : parseMarkdownContent(filePath, rawContent);

    const issues = runStructuralAnalysis(parsed, structuralConfig);
    const score = calculateScore(issues);
    const { readinessScore } = computeReadiness(issues);

    entries.push({
      commit: hash.slice(0, 7),
      date,
      subject,
      score,
      grade: calculateGrade(score),
      issueCount: issues.length,
      criticalCount: issues.filter((i) => i.severity === 'critical').length,
      warningCount: issues.filter((i) => i.severity === 'warning').length,
      readinessScore,
    });
  }

  return entries;
}
