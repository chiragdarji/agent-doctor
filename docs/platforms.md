# Platform-Specific Behaviour

agent-doctor detects which AI platform an instruction file targets and adjusts rule severities and suggestion text accordingly.

## Supported Platforms

| Platform | File patterns |
|----------|--------------|
| `anthropic` | `CLAUDE.md`, `.claude/agents/*.md`, `.claude/commands/*.md` |
| `openai` | `AGENTS.md` |
| `cursor` | `.cursor/rules/*.mdc` |
| `gemini` | `GEMINI.md` |
| `github-copilot` | `.github/copilot-instructions.md` |
| `windsurf` | `.windsurfrules` |
| `roo` | `.roo/rules/*.md` |

---

## Cursor (`.mdc` files)

Cursor has the strictest frontmatter requirements. The following severities are upgraded:

| Rule | Default | Cursor |
|------|---------|--------|
| `missing-always-apply` | warning | **critical** |

**Reason:** Without `alwaysApply: true`, Cursor silently ignores the rule in agent mode. This is not a style issue — the file will never be loaded.

### Cursor-specific suggestions

**`missing-tool-list`:**
> "Add an '## Available Tools' section listing the Cursor tools this rule activates (e.g. `terminal`, `edit_file`, `run_command`) so the agent knows its capabilities."

**`missing-success-criteria`:**
> "Add Cursor-compatible completion verification. Example: 'Done when the Cursor terminal shows exit code 0 and all modified files are saved.'"

**`hardcoded-environment`:**
> "Use Cursor workspace-relative paths like `{{workspaceFolder}}/src` instead of absolute system paths."

**`missing-recovery-strategy`:**
> "Add error handling for Cursor agent operations. Example: 'If the terminal command fails, check the output panel and fix the reported error before proceeding.'"

---

## Anthropic / Claude Code (`CLAUDE.md`, `.claude/agents/*.md`)

**`missing-tool-list`:**
> "Add a '## Available Tools' section listing the Claude Code tools this agent can use (e.g. `Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep`) so behaviour is predictable."

**`missing-success-criteria`:**
> "Add Claude Code-compatible completion criteria. Example: 'Done when `npm test` exits 0 and the feature works in the browser.'"

**`hardcoded-environment`:**
> "Use `$HOME`, `$PROJECT_ROOT`, or `$PORT` instead of hardcoded paths. Claude Code agents run in different environments."

**`missing-recovery-strategy`:**
> "Add recovery steps for Claude Code. Example: 'If the build fails, run `npm run typecheck` to find type errors before retrying.'"

---

## OpenAI (`AGENTS.md`)

**`missing-tool-list`:**
> "Add a '## Tools' section listing available function tools with brief descriptions to prevent the agent from hallucinating unavailable capabilities."

**`missing-success-criteria`:**
> "Define acceptance criteria the agent can evaluate. Example: 'Success when the API returns status 200 and the response body matches the schema.'"

**`missing-recovery-strategy`:**
> "Add fallback instructions for OpenAI agent function failures. Example: 'If the function call returns an error, log the error code and retry once with reduced parameters.'"

---

## GitHub Copilot (`.github/copilot-instructions.md`)

**`missing-tool-list`:**
> "List the GitHub Copilot capabilities this file configures (code completion, chat, PR summaries) so the scope is explicit."

**`missing-success-criteria`:**
> "Define what correct Copilot output looks like. Example: 'Suggestions should follow the project ESLint config and include JSDoc for public functions.'"

---

## Detecting the Platform Programmatically

```typescript
import { detectPlatform, applyPlatformOverrides } from '@chiragdarji/agent-doctor';

const platform = detectPlatform('cursor-mdc');   // 'cursor'
const issues = runStructuralAnalysis(parsed, config);
const adjusted = applyPlatformOverrides(issues, platform);
// missing-always-apply is now 'critical' on Cursor
```

---

## File Type Reference

```typescript
type FileType =
  | 'claude-md'              // CLAUDE.md
  | 'agents-md'              // AGENTS.md
  | 'cursor-mdc'             // .cursor/rules/*.mdc
  | 'gemini-md'              // GEMINI.md
  | 'copilot-instructions'   // .github/copilot-instructions.md
  | 'claude-agent'           // .claude/agents/*.md
  | 'claude-command'         // .claude/commands/*.md
  | 'windsurf-rules'         // .windsurfrules
  | 'roo-rule'               // .roo/rules/*.md
  | 'unknown';
```
