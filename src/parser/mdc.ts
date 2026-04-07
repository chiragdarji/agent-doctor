import { readFileSync } from 'node:fs';
import { load as yamlLoad } from 'js-yaml';
import { countTokens } from '../tokens.js';
import { parseSections } from './sections.js';
import type { ParsedFile } from '../types.js';

/** YAML frontmatter delimiter */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Splits raw .mdc content into frontmatter data and body using js-yaml safe load().
 * Never uses eval() — eliminates the gray-matter JS-engine vulnerability.
 */
function parseFrontmatter(raw: string): { content: string; data: Record<string, unknown> } {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match || match[1] === undefined) return { content: raw, data: {} };
  const parsed = yamlLoad(match[1]);
  const data =
    parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { content: match[2] ?? '', data };
}

/**
 * Parses a Cursor .mdc rule file, extracting YAML frontmatter and markdown sections.
 */
export function parseMdc(filePath: string): ParsedFile {
  const raw = readFileSync(filePath, 'utf8');
  const { content, data } = parseFrontmatter(raw);
  const sections = parseSections(content);

  return {
    filePath,
    fileType: 'cursor-mdc',
    rawContent: raw,
    content,
    frontmatter: data,
    sections,
    tokenCount: countTokens(content),
  };
}
