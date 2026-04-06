import { extname, basename } from 'node:path';
import { parseMarkdown } from './markdown.js';
import { parseMdc } from './mdc.js';
import type { ParsedFile } from '../types.js';

/**
 * Routes to the correct parser based on file extension and path.
 * Supports .md, .mdc, and the legacy .cursorrules format.
 */
export function parseFile(filePath: string): ParsedFile {
  const ext = extname(filePath).toLowerCase();
  const base = basename(filePath);

  if (ext === '.mdc') return parseMdc(filePath);
  // Legacy .cursorrules — parse as markdown; legacy-format rule will flag it
  if (base === '.cursorrules') return parseMarkdown(filePath);
  if (ext === '.md') return parseMarkdown(filePath);

  // Unknown extension — attempt markdown parse
  return parseMarkdown(filePath);
}

export { parseMarkdown } from './markdown.js';
export { parseMdc } from './mdc.js';
export { parseSections } from './sections.js';
