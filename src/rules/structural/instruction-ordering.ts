import { parseSections } from '../../parser/sections.js';
import type { Issue, StructuralRule } from '../../types.js';

/**
 * Headings/content that signal a safety, security, or constraint section.
 * These should appear before task/action sections.
 */
const SAFETY_HEADING_RE =
  /\b(security|auth(?:orization|entication)?|permission|access|constraint|restrict|limit|boundary|never|forbidden|prohibited|off.?limit|guardrail|safe)\b/i;

const SAFETY_CONTENT_RE =
  /\b(never (access|modify|delete|share|expose|push|commit|run|execute)|do not (access|expose|delete|modify|share|commit|push)|must not|forbidden|not allowed|off.?limit|security boundary)\b/i;

/**
 * Headings/content that signal a task or action section.
 * These are expected to appear after safety sections.
 */
const TASK_HEADING_RE =
  /\b(implement|build|create|deploy|develop|workflow|process|steps?|instructions?|tasks?|how to|getting started|usage|commands?|run|execute)\b/i;

const TASK_CONTENT_RE =
  /\b(implement|build|create|deploy|execute|run the|use the|call|invoke)\b/i;

/**
 * Flags when safety/security/constraint sections appear after task/action sections.
 *
 * Agents process instructions in order. Safety rules buried after task descriptions
 * are more likely to be missed or overridden by earlier task framing. Security
 * constraints should appear near the top, before tasks establish context.
 */
export const instructionOrdering: StructuralRule = (
  content: string,
  _filePath: string,
): Issue[] => {
  const sections = parseSections(content);
  const issues: Issue[] = [];

  let lastTaskSectionLine = -1;
  let lastTaskHeading = '';

  for (const section of sections) {
    const isTask =
      TASK_HEADING_RE.test(section.heading) ||
      (section.content.split(/\s+/).length > 20 && TASK_CONTENT_RE.test(section.content));

    // Require the HEADING to indicate a security/access section.
    // Content-only matching produces too many false positives on "What NOT To Do" sections.
    const isSafety = SAFETY_HEADING_RE.test(section.heading);

    if (isTask && !isSafety) {
      lastTaskSectionLine = section.line;
      lastTaskHeading = section.heading;
    }

    if (isSafety && lastTaskSectionLine > 0 && section.line > lastTaskSectionLine) {
      issues.push({
        ruleId: 'instruction-ordering',
        severity: 'suggestion',
        message: `Safety/constraint section "${section.heading}" appears after task section "${lastTaskHeading}" (line ${lastTaskSectionLine})`,
        suggestion:
          'Move security, access, and constraint sections before task instructions so they establish boundaries before the agent begins working',
        line: section.line,
        context: section.heading,
        relatedLine: lastTaskSectionLine,
      });
      // Reset so we only flag the first ordering violation
      lastTaskSectionLine = -1;
    }
  }

  return issues;
};
