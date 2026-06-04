import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const WELL_KNOWN_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  '.cursorrules',
  '.windsurfrules',
];

const SCANNED_DIRS: Array<{ dir: string; ext: string }> = [
  { dir: '.cursor/rules', ext: '.mdc' },
  { dir: '.claude/agents', ext: '.md' },
  { dir: '.claude/commands', ext: '.md' },
  { dir: '.roo/rules', ext: '.md' },
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

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  '.turbo',
  'vendor',
]);

/**
 * Recursively discovers agent instruction files across a workspace or monorepo.
 * Walks up to `maxDepth` directory levels, skipping common non-source directories.
 *
 * @param root     - Root directory to walk from (defaults to process.cwd())
 * @param maxDepth - Maximum directory depth to recurse (default: 4)
 */
export function discoverOrgFiles(
  root: string = process.cwd(),
  maxDepth: number = 4,
): string[] {
  const found = new Set<string>();

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;

    // Pick up well-known files at this level
    for (const candidate of WELL_KNOWN_FILES) {
      const full = resolve(dir, candidate);
      if (existsSync(full)) found.add(full);
    }

    // Scan standard subdirectories at this level
    for (const { dir: subDir, ext } of SCANNED_DIRS) {
      const full = resolve(dir, subDir);
      if (!existsSync(full)) continue;
      try {
        for (const entry of readdirSync(full)) {
          if (entry.endsWith(ext)) found.add(resolve(full, entry));
        }
      } catch {
        // Non-readable directory — skip
      }
    }

    // Recurse into subdirectories (withFileTypes avoids a separate statSync per entry)
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        // Use isSymbolicLink check to avoid following symlinks into cycles
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          walk(join(dir, entry.name), depth + 1);
        }
      }
    } catch {
      // Unreadable directory — skip
    }
  }

  walk(root, 0);
  return Array.from(found);
}
