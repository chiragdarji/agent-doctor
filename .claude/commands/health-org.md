# /health-org — Agent Doctor Org Dashboard

Run agent-doctor across all AI agent instruction files in the workspace and show the org-level health dashboard.

## What to do

1. Use the `analyse_agent_file` MCP tool to analyse each discovered file:
   - Well-known files: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`
   - Cursor rules: `.cursor/rules/*.mdc`
   - Sub-packages: repeat for any `packages/*/`, `apps/*/`, `services/*/` directories
   - Use `layers: ["structural"]` (org scan is structural-only — no LLM cost)

2. Aggregate and display:
   - Summary table: file type | count | avg score | avg readiness | grade breakdown (A/B/C/D/F)
   - Overall readiness dimensions with scores for: Observable / Bounded / Reversible / Tooled / Documented
   - Per-file compact list: score | grade | issue count | path
   - Flag any file with grade D or F as needing immediate attention

3. Suggest the top 3 highest-impact improvements across the workspace.

## Argument: `$ARGUMENTS`

If `$ARGUMENTS` is a directory path, scan that directory instead of the current workspace root.
