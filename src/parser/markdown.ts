import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import matter from 'gray-matter';
import { countTokens } from '../tokens.js';
import { parseSections } from './sections.js';
import type { FileType, ParsedFile } from '../types.js';

/**
 * Infers the agent instruction file type from the file path.
 */
export function detectFileType(filePath: string): FileType {
  const base = basename(filePath);
  const normalised = filePath.replace(/\\/g, '/');

  if (/^claude\.md$/i.test(base)) return 'claude-md';
  if (/^agents\.md$/i.test(base)) return 'agents-md';
  if (/^gemini\.md$/i.test(base)) return 'gemini-md';
  if (normalised.toLowerCase().endsWith('copilot-instructions.md')) return 'copilot-instructions';
  if (/\.claude\/agents\//i.test(normalised) && base.endsWith('.md')) return 'claude-agent';
  if (/\.claude\/commands\//i.test(normalised) && base.endsWith('.md')) return 'claude-command';
  return 'unknown';
}

/**
 * Parses a Markdown-based agent instruction file (CLAUDE.md, AGENTS.md, GEMINI.md, etc.)
 * into a structured ParsedFile object.
 */
export function parseMarkdown(filePath: string): ParsedFile {
  const raw = readFileSync(filePath, 'utf8');
  const { content, data } = matter(raw);
  const sections = parseSections(content);
  const hasFrontmatter = Object.keys(data).length > 0;

  return {
    filePath,
    fileType: detectFileType(filePath),
    rawContent: raw,
    content,
    ...(hasFrontmatter ? { frontmatter: data as Record<string, unknown> } : {}),
    sections,
    tokenCount: countTokens(content),
  };
}
