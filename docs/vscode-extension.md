# VS Code Extension

The Agent Doctor VS Code extension provides inline diagnostics and Quick Fix actions for AI agent instruction files directly in the editor.

**Extension ID:** `chiragdarji.vscode-agent-doctor`  
**Current version:** 0.2.1  
**Marketplace:** [Visual Studio Marketplace — Agent Doctor](https://marketplace.visualstudio.com/items?itemName=chiragdarji.vscode-agent-doctor)

---

## Installation

### From the Marketplace

1. Open VS Code
2. Go to **Extensions** (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for **Agent Doctor**
4. Click **Install**

### From VSIX (manual)

```bash
code --install-extension vscode-agent-doctor-0.2.1.vsix
```

---

## Features

### Inline Diagnostics

The extension runs structural analysis (zero API cost) on every file open and save.

Issues appear as:
- **Red squiggles** — critical issues (e.g. hardcoded credentials, unclosed code blocks)
- **Yellow squiggles** — warnings (e.g. missing persona, duplicate headings)
- **Blue squiggles** — suggestions (e.g. missing examples, instruction ordering)

All diagnostics also appear in the **Problems panel** (`Ctrl+Shift+M` / `Cmd+Shift+M`).

### Quick Fix

For auto-fixable rules, a Quick Fix lightbulb appears on the affected line. Press `Ctrl+.` / `Cmd+.` or click the lightbulb to apply the fix.

Quick Fix is supported for:

| Rule | Fix Action |
|------|-----------|
| `sensitive-data` | Redact credential with `[REDACTED]` |
| `missing-agent-persona` | Prepend persona stub |
| `hardcoded-environment` | Replace path with environment variable |
| `todo-in-instructions` | Replace TODO with HTML comment |
| `unclosed-code-block` | Append closing ``` fence |
| `empty-section` | Insert placeholder content |
| `missing-success-criteria` | Insert success criteria stub |

All Quick Fixes use `WorkspaceEdit` so they support full undo (`Ctrl+Z` / `Cmd+Z`).

### Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for:

| Command | Description |
|---------|-------------|
| `Agent Doctor: Run Full Analysis (Structural + Semantic)` | Runs both layers on the active file. Prompts for an API key if none is configured. |
| `Agent Doctor: Run Structural Analysis` | Force-refreshes structural diagnostics on the active file. |

### Supported Files

The extension activates on:

| File pattern | Platform |
|--------------|----------|
| `CLAUDE.md` | Anthropic Claude Code |
| `AGENTS.md` | OpenAI Codex / universal |
| `GEMINI.md` | Google Gemini |
| `.cursor/rules/*.mdc` | Cursor IDE |
| Any `*.md` file | Generic markdown |

---

## Settings

Open **Settings** (`Ctrl+,` / `Cmd+,`) and search for **Agent Doctor**, or add to `settings.json`:

```json
{
  "agentDoctor.anthropicApiKey": "sk-ant-...",
  "agentDoctor.openaiApiKey": "sk-...",
  "agentDoctor.model": "claude-sonnet-4-6",
  "agentDoctor.enableOnSave": true,
  "agentDoctor.failOnSeverity": "critical"
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `agentDoctor.anthropicApiKey` | `""` | Anthropic API key. Falls back to `ANTHROPIC_API_KEY` env var. Required for **Run Full Analysis** with Claude models. |
| `agentDoctor.openaiApiKey` | `""` | OpenAI API key. Falls back to `OPENAI_API_KEY` env var. |
| `agentDoctor.model` | `"claude-sonnet-4-6"` | LLM model for semantic analysis. |
| `agentDoctor.enableOnSave` | `true` | Run structural analysis automatically when a supported file is saved. |
| `agentDoctor.failOnSeverity` | `"critical"` | Minimum severity shown as an **error** diagnostic. Issues below this threshold are shown as warnings or hints. |

---

## Architecture

The extension bundles the agent-doctor core library (structural rules only) into a single CJS bundle using esbuild. The `tiktoken` dependency is replaced with a lightweight character-count stub (`text.length / 4`) so no native binaries are required — the extension works on all platforms without a compilation step.

**Bundle size:** ~675 KB  
**Native dependencies:** none

---

## Building the Extension Locally

```bash
cd packages/vscode-agent-doctor
npm install
npm run build       # esbuild → dist/extension.js
npm run package     # vsce package → vscode-agent-doctor-x.x.x.vsix
```

Publish to the Marketplace:

```bash
npm run publish     # requires VSCE_PAT environment variable
```

---

## Changelog

### 0.2.1 (2026-06-08)
- Patch bump aligned with npm v1.0.1
- Removed unused variable (lint fix)

### 0.2.0 (2026-06-08)
- Quick Fix support for three new rules: `sensitive-data`, `missing-agent-persona`, `hardcoded-environment`

### 0.1.0 (initial release)
- On-save structural diagnostics
- Quick Fix for `todo-in-instructions`, `unclosed-code-block`, `empty-section`, `missing-success-criteria`
- Commands: Run Full Analysis, Run Structural Analysis
- Settings: `anthropicApiKey`, `openaiApiKey`, `model`, `enableOnSave`, `failOnSeverity`
