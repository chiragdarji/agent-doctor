import { execFileSync } from 'node:child_process';
import { extname, dirname, relative, resolve, basename, join } from 'node:path';
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { promisify } from 'node:util';
import { parseMarkdownContent } from '../parser/markdown.js';
import { parseMdcContent } from '../parser/mdc.js';
import { runStructuralAnalysis } from './structural.js';
import { calculateScore, calculateGrade, computeReadiness } from './index.js';
import type { Config, Grade } from '../types.js';

const execFileAsync = promisify(execFile);

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
  // Resolve symlinks on the parent directory (e.g. /var → /private/var on macOS) so
  // that relative(gitRoot, absPath) produces the correct path on all platforms.
  // We resolve the directory rather than the full path so non-existent files are handled.
  const rawAbsPath = resolve(process.cwd(), filePath);
  let absPath: string;
  try {
    absPath = join(realpathSync(dirname(rawAbsPath)), basename(rawAbsPath));
  } catch {
    absPath = rawAbsPath;
  }
  // Detect git root from the file's directory so fixture repos in /tmp work correctly
  const fileDir = dirname(absPath);

  let gitRoot: string;
  try {
    gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      cwd: fileDir,
    }).trim();
  } catch {
    throw new Error('Not a git repository — --history requires git');
  }

  const gitRelPath = relative(gitRoot, absPath);

  let logOutput: string;
  try {
    // Use execFileSync (no shell) to avoid injection via gitRelPath
    logOutput = execFileSync(
      'git',
      ['log', '--format=%H|%ai|%s', `-n`, String(n), '--', gitRelPath],
      { encoding: 'utf8', cwd: gitRoot },
    ).trim();
  } catch {
    throw new Error(`Failed to read git log for ${filePath}`);
  }

  if (!logOutput) return [];

  // Parse commit metadata from log lines
  interface CommitMeta { hash: string; date: string; subject: string }
  const commits: CommitMeta[] = [];
  for (const line of logOutput.split('\n')) {
    if (!line.trim()) continue;
    const pipeIdx = line.indexOf('|');
    const pipe2Idx = line.indexOf('|', pipeIdx + 1);
    if (pipeIdx < 0 || pipe2Idx < 0) continue;

    commits.push({
      hash: line.slice(0, pipeIdx),
      date: (line.slice(pipeIdx + 1, pipe2Idx).split(' ')[0] ?? '').trim(),
      subject: line.slice(pipe2Idx + 1).trim(),
    });
  }

  // Fetch all file snapshots in parallel (no shell — execFile with args array)
  const contents = await Promise.all(
    commits.map(({ hash }) =>
      execFileAsync('git', ['show', `${hash}:${gitRelPath}`], {
        encoding: 'utf8',
        cwd: gitRoot,
      })
        .then(({ stdout }) => stdout)
        .catch(() => null),
    ),
  );

  const isMdc = extname(filePath).toLowerCase() === '.mdc';
  const structuralConfig = { ...config, layers: ['structural'] as Config['layers'] };
  const entries: HistoryEntry[] = [];

  for (let i = 0; i < commits.length; i++) {
    const rawContent = contents[i];
    if (rawContent == null) continue;

    const { hash, date, subject } = commits[i]!;
    const parsed = isMdc
      ? parseMdcContent(filePath, rawContent)
      : parseMarkdownContent(filePath, rawContent);

    // Pass empty pluginRules — history mode is structural-only, no plugin loading needed
    const issues = runStructuralAnalysis(parsed, structuralConfig, []);
    const score = calculateScore(issues);
    const { readinessScore } = computeReadiness(issues);

    let criticalCount = 0;
    let warningCount = 0;
    for (const issue of issues) {
      if (issue.severity === 'critical') criticalCount++;
      else if (issue.severity === 'warning') warningCount++;
    }

    entries.push({
      commit: hash.slice(0, 7),
      date,
      subject,
      score,
      grade: calculateGrade(score),
      issueCount: issues.length,
      criticalCount,
      warningCount,
      readinessScore,
    });
  }

  return entries;
}
