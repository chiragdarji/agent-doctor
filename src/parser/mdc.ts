import { readFileSync } from 'node:fs';
import matter from 'gray-matter';
import { countTokens } from '../tokens.js';
import { parseSections } from './sections.js';
import type { ParsedFile } from '../types.js';

/**
 * Parses a Cursor .mdc rule file, extracting YAML frontmatter and markdown sections.
 */
export function parseMdc(filePath: string): ParsedFile {
  const raw = readFileSync(filePath, 'utf8');
  const { content, data } = matter(raw);
  const sections = parseSections(content);

  return {
    filePath,
    fileType: 'cursor-mdc',
    rawContent: raw,
    content,
    frontmatter: data as Record<string, unknown>,
    sections,
    tokenCount: countTokens(content),
  };
}
