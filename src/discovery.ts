import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const WELL_KNOWN_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  '.cursorrules',
];

const SCANNED_DIRS: Array<{ dir: string; ext: string }> = [
  { dir: '.cursor/rules', ext: '.mdc' },
  { dir: '.claude/agents', ext: '.md' },
  { dir: '.claude/commands', ext: '.md' },
];

/**
 * Discovers all agent instruction files in a project directory.
 * Checks well-known paths and scans standard subdirectories.
 *
 * @param cwd - Root directory to search from (defaults to process.cwd())
 */
export function discoverFiles(cwd: string = process.cwd()): string[] {
  const files: string[] = [];

  for (const candidate of WELL_KNOWN_FILES) {
    const full = resolve(cwd, candidate);
    if (existsSync(full)) files.push(full);
  }

  for (const { dir, ext } of SCANNED_DIRS) {
    const full = resolve(cwd, dir);
    if (!existsSync(full)) continue;
    try {
      for (const entry of readdirSync(full)) {
        if (entry.endsWith(ext)) {
          files.push(resolve(full, entry));
        }
      }
    } catch {
      // Non-readable directory — skip silently
    }
  }

  return files;
}
