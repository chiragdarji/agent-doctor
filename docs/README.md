# agent-doctor Documentation

Semantic health checks for AI agent instruction files.

## Guides

| Document | Description |
|----------|-------------|
| [Getting Started](./getting-started.md) | Installation, quick start, first analysis |
| [CLI Reference](./cli-reference.md) | All flags, options, exit codes |
| [Configuration](./configuration.md) | `.agentdoctor.json`, env vars, rule overrides |
| [Rules Reference](./rules.md) | All 21 structural + 10 semantic rules |
| [Auto-Fix](./auto-fix.md) | `--fix` flag and fixable rules |
| [Readiness Score](./readiness-score.md) | Agent Readiness Score and 5 dimensions |
| [Platforms](./platforms.md) | Platform-specific behavior (Cursor, Claude, Copilot…) |
| [MCP Server](./mcp-server.md) | MCP setup for Claude Code and Cursor |
| [VS Code Extension](./vscode-extension.md) | Inline diagnostics and Quick Fix |
| [Programmatic API](./api.md) | TypeScript API for integration |
| [Custom Plugins](./plugins.md) | Authoring and loading custom rules |
| [Contributing](./contributing.md) | Architecture, coding standards, tests |

## What is agent-doctor?

`agent-doctor` validates AI agent instruction files at two levels:

1. **Structural layer** — 21 regex/AST checks that run in milliseconds with no API cost. Catches missing frontmatter, unclosed code blocks, hardcoded credentials, TODO markers, and more.

2. **Semantic layer** — 10 LLM-powered checks that find issues structural analysis cannot see: contradictory rules, decision loops, vague boundaries, and missing recovery strategies.

Every analysis produces a **Health Score** (0–100) and an **Agent Readiness Score** mapping issues to five operational dimensions: Observable, Bounded, Reversible, Tooled, and Documented.

## Supported File Types

| File | Platform |
|------|----------|
| `CLAUDE.md` | Anthropic Claude Code |
| `AGENTS.md` | OpenAI Codex / universal |
| `.cursor/rules/*.mdc` | Cursor IDE |
| `GEMINI.md` | Google Gemini |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.claude/agents/*.md` | Claude Code agents |
| `.claude/commands/*.md` | Claude Code slash commands |
| `.windsurfrules` | Windsurf IDE |
| `.roo/rules/*.md` | Roo-code |
