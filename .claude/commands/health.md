# /health — Agent Doctor Health Check

Run agent-doctor health analysis on AI agent instruction files in the current project.

## What to do

1. Call the `analyse_agent_file` MCP tool (agent-doctor server) on the target file.
   - If the user named a specific file, use that path.
   - If no file was specified, auto-detect: check for `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`,
     `.github/copilot-instructions.md`, then `.cursor/rules/*.mdc` — analyse the first found.
   - Pass `layers: ["structural", "semantic"]` when an API key is available; otherwise
     `layers: ["structural"]`.

2. Present the results clearly:
   - Show the **health score** (0–100) and **grade** (A/B/C/D/F) prominently.
   - Show the **readiness score** and the 5 dimensions (Observable / Bounded / Reversible /
     Tooled / Documented) as a mini bar chart.
   - List every issue grouped by severity: critical first, then warnings, then suggestions.
   - For each issue show: rule ID, message, and the suggestion.

3. After listing issues, offer to:
   - **Auto-fix** structural issues with `--fix` (call `suggest_fix` for each fixable rule)
   - **Explain** any specific issue in detail if the user asks

## Example invocations

```
/health                        # analyse auto-detected file
/health CLAUDE.md              # analyse specific file
/health .cursor/rules/api.mdc  # analyse a Cursor rule
```

## Argument: `$ARGUMENTS`

If `$ARGUMENTS` is non-empty, treat it as the file path to analyse.
If empty, auto-detect as described above.
