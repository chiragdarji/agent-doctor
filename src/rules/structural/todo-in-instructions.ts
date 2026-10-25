import type { Issue, StructuralRule } from '../../types.js';

const TODO_RE = /\b(TODO|FIXME|HACK|PLACEHOLDER|XXX|TBD)\b/;

/**
 * Detects TODO/FIXME/PLACEHOLDER/TBD markers left in instruction files.
 *
 * Agents read these files literally. An instruction like:
 *   "Always use TODO: add tool name here for file operations"
 * will be followed as written — the agent will literally reference "TODO: add tool name here".
 *
 * These markers are also a signal that the instruction file is incomplete,
 * which means the agent is operating on partial guidance.
 */
export const todoInInstructions: StructuralRule = (content: string, _filePath: string): Issue[] => {
  const lines = content.split('\n');
  const issues: Issue[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Track fenced code blocks (``` or ~~~)
    if (/^(`{3,}|~{3,})/.test(line.trim())) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    // Skip code blocks — TODOs in examples are intentional
    if (inCodeBlock) continue;

    // Skip table rows — TODOs in documentation tables describe the rule, not instructions
    if (/^\s*\|/.test(line)) continue;

    // Strip inline code spans before matching so `TODO` in code doesn't trigger
    const stripped = line.replace(/`[^`]*`/g, '');

    const match = TODO_RE.exec(stripped);
    if (!match) continue;

    issues.push({
      ruleId: 'todo-in-instructions',
      severity: 'warning',
      message: `Incomplete instruction marker "${match[0]}" found — agent will follow this literally`,
      suggestion: 'Replace the placeholder with the actual instruction before using this file',
      line: i + 1,
      context: line.trim(),
    });
  }

  return issues;
};
