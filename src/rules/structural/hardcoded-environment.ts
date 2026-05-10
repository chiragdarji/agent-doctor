import type { Issue, StructuralRule } from '../../types.js';

// Unix paths that reference real user/system locations (not generic placeholders like /path/to/)
const UNIX_PATH_RE = /(?<![`'"/\w])(\/(?:home|usr|etc|var|root|opt|srv|tmp|proc|sys)\/\S+)/g;
// Windows absolute paths
const WIN_PATH_RE = /\b([A-Z]:\\[\w\\.\- ]+)/g;
// localhost with port (operational, not illustrative)
const LOCALHOST_RE = /\blocalhost:(\d{2,5})\b/g;

const EXAMPLE_LINE_RE = /\b(e\.?g\.?|for example|example[s]?|sample|illustration|demo)\b/i;

/**
 * Flags hardcoded environment-specific values (absolute paths, localhost ports) in
 * instruction files, outside of code blocks or example contexts.
 *
 * Agents running in different environments will fail when instructions reference a
 * specific machine's filesystem layout or port configuration.
 * Maps to the "Bounded" dimension of the Factory.ai Agent Readiness framework.
 */
export const hardcodedEnvironment: StructuralRule = (
  content: string,
  _filePath: string,
): Issue[] => {
  const lines = content.split('\n');
  const issues: Issue[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Track code block boundaries
    if (/^```|^~~~/.test(line.trim())) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Skip lines that are clearly examples
    if (EXAMPLE_LINE_RE.test(line)) continue;

    const lineNum = i + 1;

    for (const re of [UNIX_PATH_RE, WIN_PATH_RE]) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(line)) !== null) {
        const path = match[1] ?? match[0];
        issues.push({
          ruleId: 'hardcoded-environment',
          severity: 'warning',
          message: `Hardcoded path "${path}" ties these instructions to a specific environment`,
          suggestion:
            'Replace with an environment variable (e.g. $HOME, $PROJECT_ROOT) or a relative path',
          line: lineNum,
          context: line.trim(),
        });
      }
    }

    LOCALHOST_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = LOCALHOST_RE.exec(line)) !== null) {
      const port = match[1] ?? '';
      issues.push({
        ruleId: 'hardcoded-environment',
        severity: 'warning',
        message: `Hardcoded localhost:${port} assumes a specific port will always be available`,
        suggestion:
          'Reference the port via an environment variable or note it as a configurable value',
        line: lineNum,
        context: line.trim(),
      });
    }
  }

  return issues;
};
