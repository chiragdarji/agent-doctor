# Getting Started

## Requirements

- Node.js 20 or later

## Installation

### One-off (no install)

```bash
npx @chiragdarji/agent-doctor CLAUDE.md
```

### Global install

```bash
npm install -g @chiragdarji/agent-doctor
agent-doctor CLAUDE.md
```

### Project dev dependency

```bash
npm install --save-dev @chiragdarji/agent-doctor
```

## First Analysis

Run structural analysis (no API key required):

```bash
npx @chiragdarji/agent-doctor CLAUDE.md --structural-only
```

Run full analysis including semantic checks:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx @chiragdarji/agent-doctor CLAUDE.md
```

Analyse every instruction file in the project:

```bash
npx @chiragdarji/agent-doctor --all
```

## Understanding the Output

```
❌  CRITICAL  sensitive-data
    Line 12: "ANTHROPIC_API_KEY=sk-ant-abc123..."
    → Remove the credential and use an environment variable instead.

⚠   WARNING   missing-success-criteria
    Line 45: "Deploy the application"
    → Add a completion signal: "Done when the health check at /status returns 200."

────────────────────────────────────────────
Health Score   62 / 100  (C)
Readiness      55 / 100  obs 80 · bnd 45 · rev 40 · tld 80 · doc 60
Issues         1 critical · 1 warning · 0 suggestions
────────────────────────────────────────────
```

- **Health Score** — deducted per issue (critical −20, warning −10, suggestion −3)
- **Readiness Score** — average across five dimensions (Observable, Bounded, Reversible, Tooled, Documented)
- **Grade** — A (90+), B (75+), C (60+), D (40+), F (<40)

## Auto-Fix

Apply all fixable structural issues automatically:

```bash
npx @chiragdarji/agent-doctor CLAUDE.md --fix
```

Preview what would change without writing:

```bash
npx @chiragdarji/agent-doctor CLAUDE.md --fix --dry-run
```

## Scaffold a New File

Create a well-structured instruction file that passes all structural checks:

```bash
# For Claude Code
npx @chiragdarji/agent-doctor --init --type claude

# For Cursor
npx @chiragdarji/agent-doctor --init --type cursor

# For OpenAI Codex / universal
npx @chiragdarji/agent-doctor --init --type agents
```

## CI/CD Integration

Exit code `1` when critical issues are found:

```yaml
# .github/workflows/agent-doctor.yml
- name: Lint instruction files
  run: npx @chiragdarji/agent-doctor --all --structural-only --fail-on critical
```

Gate mode outputs machine-readable JSON (useful for orchestrators):

```bash
npx @chiragdarji/agent-doctor CLAUDE.md --gate
# → {"passed":true,"score":88,"grade":"B","readinessScore":72,"blockedBy":[]}
```

## Watch Mode

Re-run analysis every time you save the file:

```bash
npx @chiragdarji/agent-doctor CLAUDE.md --watch
```

## Next Steps

- [Configure rules and thresholds](./configuration.md)
- [Understand all rules](./rules.md)
- [Set up the MCP server](./mcp-server.md)
- [Install the VS Code extension](./vscode-extension.md)
