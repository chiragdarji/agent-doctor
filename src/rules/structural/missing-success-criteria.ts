import { parseSections } from '../../parser/sections.js';
import type { Issue, StructuralRule } from '../../types.js';

const TASK_VERBS_RE =
  /\b(implement|build|create|deploy|execute|generate|migrate|refactor|integrate|develop|set up|configure|write)\b/i;

const SUCCESS_SIGNAL_RE =
  /\b(done when|success(fully)?|complete when|verify|confirm|check|test|assert|expected|should result|acceptance|pass(es)?|validated?)\b/i;

const SKIP_HEADING_RE = /\b(example|overview|background|introduction|context|about|reference)\b/i;

const MIN_SENTENCES = 3;

/**
 * Flags sections that describe tasks with imperative verbs but provide no measurable
 * success criteria or completion signal.
 *
 * Without observable outcomes, agents can't determine when a task is done, leading to
 * incomplete work, over-engineering, or infinite retry loops.
 * Maps to the "Observable" dimension of the Factory.ai Agent Readiness framework.
 */
export const missingSuccessCriteria: StructuralRule = (
  content: string,
  _filePath: string,
): Issue[] => {
  const sections = parseSections(content);
  const issues: Issue[] = [];

  for (const section of sections) {
    if (SKIP_HEADING_RE.test(section.heading)) continue;

    // Strip code blocks before sentence counting / regex checks
    const text = section.content.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '');

    // Require meaningful length to avoid false positives on short setup sections
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
    if (sentences.length < MIN_SENTENCES) continue;

    if (TASK_VERBS_RE.test(text) && !SUCCESS_SIGNAL_RE.test(text)) {
      issues.push({
        ruleId: 'missing-success-criteria',
        severity: 'warning',
        message: `Section "${section.heading}" describes tasks but has no success criteria or completion signal`,
        suggestion:
          'Add a verification step: e.g. "Done when all tests pass" or "Verify by running <command> and confirming <expected output>"',
        line: section.line,
        context: section.heading,
      });
    }
  }

  return issues;
};
