# Agent Doctor — VS Code Extension

Inline diagnostics for AI agent instruction files (`CLAUDE.md`, `AGENTS.md`, `.mdc`, `GEMINI.md`).

## Features

- **Structural analysis on save** — 16 rules run instantly, zero API cost
- **Inline diagnostics** — issues appear in the Problems panel and as squiggles
- **Quick Fix** — one-click fixes for `todo-in-instructions`, `unclosed-code-block`, `empty-section`, `missing-success-criteria`
- **Full semantic analysis on demand** — command palette → *Agent Doctor: Run Full Analysis*
- **Semantic analysis** requires an Anthropic or OpenAI API key (configured in settings)

## Setup

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=chiragdarji.vscode-agent-doctor) or via:

```
ext install chiragdarji.vscode-agent-doctor
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `agentDoctor.anthropicApiKey` | `""` | Anthropic API key (falls back to `ANTHROPIC_API_KEY` env var) |
| `agentDoctor.openaiApiKey` | `""` | OpenAI API key (falls back to `OPENAI_API_KEY` env var) |
| `agentDoctor.model` | `claude-sonnet-4-6` | LLM model for semantic analysis |
| `agentDoctor.enableOnSave` | `true` | Run structural analysis on save |
| `agentDoctor.failOnSeverity` | `critical` | Severity shown as an error (others as warning/hint) |

## Commands

| Command | Description |
|---------|-------------|
| `Agent Doctor: Run Full Analysis` | Structural + semantic analysis of the active file |
| `Agent Doctor: Run Structural Analysis` | Force-refresh structural diagnostics |

## Building from source

```bash
cd packages/vscode-agent-doctor
npm install
npm run build        # produces dist/extension.js
npm run package      # produces .vsix
```
