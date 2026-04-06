import { countTokens } from '../tokens.js';
import type { Section } from '../types.js';

/**
 * Parses markdown content into an array of Section objects, one per heading.
 * Content before the first heading is ignored (treated as preamble).
 */
export function parseSections(content: string): Section[] {
  const lines = content.split('\n');
  const sections: Section[] = [];
  let current: Section | null = null;
  let bodyLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = line.match(/^(#{1,6})\s+(.+)$/);

    if (match) {
      if (current !== null) {
        finaliseSection(current, bodyLines, sections);
      }
      current = {
        heading: match[2]!.trim(),
        level: match[1]!.length,
        content: '',
        line: i + 1,
        tokenCount: 0,
      };
      bodyLines = [];
    } else if (current !== null) {
      bodyLines.push(line);
    }
  }

  if (current !== null) {
    finaliseSection(current, bodyLines, sections);
  }

  return sections;
}

function finaliseSection(section: Section, lines: string[], out: Section[]): void {
  const body = lines.join('\n').trim();
  section.content = body;
  section.tokenCount = countTokens(body);
  out.push(section);
}
