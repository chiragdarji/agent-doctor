import type { Issue, StructuralRule } from '../../types.js';

// Matches "see the X section", "refer to X", "as described in the X section", etc.
// Capture group 1 is the referenced section name.
const SECTION_REF_RE =
  /\b(?:see|refer\s+to|check|as\s+(?:described|documented|specified|outlined|mentioned|noted)\s+in|per)\s+(?:the\s+)?["']?([A-Za-z][^"'\n#<]{2,50}?)["']?\s+section\b/gi;

// Markdown heading — captures the heading text (without the # characters)
const HEADING_RE = /^#{1,6}\s+(.+)$/gm;

/** Normalise a heading or reference for fuzzy comparison. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects "see the X section" cross-references where section X does not exist
 * as a heading in the same file.
 *
 * Only fires for Markdown files (not `.mdc` frontmatter).
 * Skips fenced code blocks and table rows.
 */
export const brokenSectionReference: StructuralRule = (
  content: string,
  filePath: string,
): Issue[] => {
  // Only applies to Markdown files
  if (filePath.endsWith('.mdc') || filePath.endsWith('.cursorrules')) return [];

  // Collect all heading texts
  const headings: string[] = [];
  let m: RegExpExecArray | null;
  HEADING_RE.lastIndex = 0;
  while ((m = HEADING_RE.exec(content)) !== null) {
    headings.push(normalise(m[1]!.trim()));
  }

  if (headings.length === 0) return [];

  const issues: Issue[] = [];
  const lines = content.split('\n');
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (/^(`{3,}|~{3,})/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    if (/^\s*\|/.test(line)) continue;

    // Strip inline code before scanning
    const stripped = line.replace(/`[^`]*`/g, '');

    SECTION_REF_RE.lastIndex = 0;
    let refMatch: RegExpExecArray | null;
    while ((refMatch = SECTION_REF_RE.exec(stripped)) !== null) {
      const refText = normalise(refMatch[1]!.trim());

      // Check if any heading is a superset or subset of the reference (fuzzy)
      const found = headings.some(
        (h) => h.includes(refText) || refText.includes(h),
      );

      if (!found) {
        issues.push({
          ruleId: 'broken-section-reference',
          severity: 'warning',
          message: `Reference to "${refMatch[1]!.trim()} section" but no such heading exists`,
          suggestion:
            `Add a heading that matches "${refMatch[1]!.trim()}", or update the reference ` +
            `to match an existing heading.`,
          line: i + 1,
          context: line.trim().slice(0, 120),
        });
        break; // one issue per line
      }
    }
  }

  return issues;
};
