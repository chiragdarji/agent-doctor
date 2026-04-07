import type { Issue, StructuralRule } from '../../types.js';

/**
 * Detects unclosed code fences (``` or ~~~).
 *
 * An odd number of opening fences means the file has an unclosed block.
 * Everything after the last opening fence will be interpreted as code by
 * the agent, causing it to treat instructions as literal code strings
 * rather than directives to follow.
 */
export const unclosedCodeBlock: StructuralRule = (content: string, _filePath: string): Issue[] => {
  const lines = content.split('\n');
  const issues: Issue[] = [];

  // Track open fences separately for backtick (```) and tilde (~~~) styles
  let backtickDepth = 0;
  let backtickOpenLine = 0;
  let tildeDepth = 0;
  let tildeOpenLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^```/.test(line)) {
      backtickDepth++;
      if (backtickDepth % 2 === 1) backtickOpenLine = i + 1;
    } else if (/^~~~/.test(line)) {
      tildeDepth++;
      if (tildeDepth % 2 === 1) tildeOpenLine = i + 1;
    }
  }

  if (backtickDepth % 2 !== 0) {
    issues.push({
      ruleId: 'unclosed-code-block',
      severity: 'critical',
      message: 'Unclosed code fence (```) — everything after this line is treated as code',
      suggestion: 'Add a closing ``` fence to end the code block',
      line: backtickOpenLine,
      context: '```',
    });
  }

  if (tildeDepth % 2 !== 0) {
    issues.push({
      ruleId: 'unclosed-code-block',
      severity: 'critical',
      message: 'Unclosed code fence (~~~) — everything after this line is treated as code',
      suggestion: 'Add a closing ~~~ fence to end the code block',
      line: tildeOpenLine,
      context: '~~~',
    });
  }

  return issues;
};
