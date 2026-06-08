import { parseSections } from '../../parser/sections.js';
import type { Issue, StructuralRule } from '../../types.js';

/**
 * Sections whose headings suggest they are already example/reference sections.
 */
const EXAMPLE_HEADING_RE =
  /\b(examples?|samples?|snippets?|demos?|reference|illustration|usage|template|quick.?start)\b/i;

/**
 * Language indicating the section already contains examples inline.
 */
const INLINE_EXAMPLE_RE = /\b(e\.g\.|for example|such as|like this|as follows|here is|here's)\b/i;

/**
 * Complex rule signal: a section that has multiple conditional/procedural clauses.
 * If a section has 3+ of these, it's considered "complex" and should have an example.
 */
const COMPLEXITY_SIGNALS = [
  /\bif\b.*\bthen\b/i,
  /\bwhen\b.*\b(use|call|invoke|run|execute)\b/i,
  /\b(first|then|next|finally|after that|before)\b/i,
  /\b(must|should|shall|always|never)\b/i,
  /\b(unless|except|only if|provided that)\b/i,
];

/** Minimum word count in a section before complexity is evaluated. */
const MIN_WORDS = 40;

/**
 * Flags sections with complex multi-step or conditional rules that have no examples.
 *
 * Examples dramatically improve instruction adherence for rules with multiple conditions,
 * ordering requirements, or non-obvious edge cases. A code block or inline "e.g." is
 * sufficient to satisfy this rule.
 */
export const missingExamples: StructuralRule = (content: string, _filePath: string): Issue[] => {
  const sections = parseSections(content);
  const issues: Issue[] = [];

  for (const section of sections) {
    if (EXAMPLE_HEADING_RE.test(section.heading)) continue;

    const wordCount = section.content.split(/\s+/).filter(Boolean).length;
    if (wordCount < MIN_WORDS) continue;

    // Already has a code block → fine
    if (/```|~~~/.test(section.content)) continue;

    // Already has inline examples
    if (INLINE_EXAMPLE_RE.test(section.content)) continue;

    // Count complexity signals
    const complexity = COMPLEXITY_SIGNALS.filter((re) => re.test(section.content)).length;
    if (complexity < 3) continue;

    issues.push({
      ruleId: 'missing-examples',
      severity: 'suggestion',
      message: `Section "${section.heading}" has complex rules (${complexity} conditional clauses) but no examples`,
      suggestion:
        'Add a code block or "e.g." inline example to illustrate the expected behaviour — agents follow examples more reliably than abstract rules',
      line: section.line,
      context: section.heading,
    });
  }

  return issues;
};
