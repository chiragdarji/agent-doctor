# agent-doctor 🩺

> **Semantic health check for AI agent instruction files.**  
> Finds the instructions that will silently break your agent — before your agent runs.

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![npm](https://img.shields.io/badge/npx-agent--doctor-black)
![MCP](https://img.shields.io/badge/MCP-server-purple)
![Status: Alpha](https://img.shields.io/badge/Status-Alpha-orange)

---

<!-- DEMO PLACEHOLDER -->
> 🎬 _Demo coming soon — `npx @chiragdarji/agent-doctor CLAUDE.md` catching a decision loop before it hits production_

---

## The Problem

Structural linters check if your `CLAUDE.md` is **well-formed**.  
`agent-doctor` checks if it will actually **work**.

There's a difference.

```md
# These pass every structural linter. They will break your agent.

- Be helpful and concise                          ← no decision boundary
- Always ask before making changes                ← conflicts with rule below  
- Complete tasks autonomously without interruption ← decision loop on file edits
- Use the fetch_data tool to retrieve information  ← tool also writes logs (agent won't know)
```

No regex catches these. No schema validates them.  
They require semantic reasoning — understanding what the agent will *do* with each instruction.

`agent-doctor` uses Claude to evaluate your instructions the way your agent will read them.

---

## Quickstart

```bash
# Analyse a single file
npx @chiragdarji/agent-doctor CLAUDE.md

# Analyse all agent instruction files in a project  
npx @chiragdarji/agent-doctor --all

# Run as MCP tool (from Claude Code or Cursor)
npx @chiragdarji/agent-doctor --mcp
```

### Example Output

```
agent-doctor 🩺  Analysing CLAUDE.md...

❌  CRITICAL  Rule 8 × Rule 12 — Decision loop detected
    Rule 8:  "Always ask before making file changes"
    Rule 12: "Complete tasks autonomously without interruption"
    These conflict on any file-editing task. Agent will stall or ignore one.
    → Add scope: "Ask only before destructive operations (delete, overwrite)."

⚠   WARNING   Rule 4 — No decision boundary
    "Be concise" gives the agent no signal for when to stop.
    → Specify: "Respond in under 150 words unless detail is requested."

⚠   WARNING   Tool: fetch_data — Misleading description
    Description says "fetches user data" but schema shows it also writes audit logs.
    Agent will not anticipate side effects.
    → Update description to list all side effects.

💡  SUGGEST   Rule 7 — No fallback defined
    "If the user asks for X, do Y" — no instruction for when X is ambiguous.
    → Add: "If intent is unclear, ask one clarifying question before proceeding."

────────────────────────────────────────────
Health Score  61 / 100  (C)
Issues        1 critical · 2 warnings · 1 suggestion
Files         CLAUDE.md
Model         claude-sonnet-4-6
────────────────────────────────────────────
```

---

## What It Checks

`agent-doctor` runs two layers of analysis:

### Layer 1 — Structural (fast, no API call)
- Missing frontmatter in `.mdc` files
- `alwaysApply` not set (Cursor agent mode silently ignores the rule)
- Empty sections, orphaned headings
- Legacy `.cursorrules` format that agent mode ignores
- Token budget per section (flags sections over threshold)

### Layer 2 — Semantic (Claude-powered)
| Check | What it catches |
|-------|-----------------|
| `decision-loop` | Two rules that conflict on a common task |
| `vague-boundary` | Instructions with no measurable success condition |
| `tool-mismatch` | Tool description doesn't match tool schema behaviour |
| `missing-fallback` | Conditional rules with no else/default branch |
| `scope-bleed` | Rule intended for one context leaks into all contexts |
| `contradiction` | Rules that directly oppose each other |
| `ambiguous-pronoun` | "it", "they", "this" with no clear referent |
| `over-permissive` | Tool granted with no usage constraint |
| `cross-file-conflict` | CLAUDE.md and AGENTS.md imply different behaviour |

---

## Supported Files

| File | Tool |
|------|------|
| `CLAUDE.md` | Anthropic Claude Code |
| `AGENTS.md` | OpenAI Codex CLI, universal |
| `.cursor/rules/*.mdc` | Cursor IDE |
| `GEMINI.md` | Google Gemini CLI |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.claude/agents/*.md` | Claude Code subagents |
| `.claude/commands/*.md` | Claude Code slash commands |

---

## MCP Integration

`agent-doctor` exposes itself as an MCP server so you can call it from **inside Claude Code or Cursor** during agent setup:

```json
// .claude/settings.json
{
  "mcpServers": {
    "agent-doctor": {
      "command": "npx",
      "args": ["@chiragdarji/agent-doctor", "--mcp"]
    }
  }
}
```

Then from Claude Code:
```
> /mcp agent-doctor analyse CLAUDE.md
> /mcp agent-doctor fix --rule decision-loop
```

---

## Configuration

```json
// .agentdoctor.json
{
  "model": "claude-sonnet-4-6",
  "layers": ["structural", "semantic"],
  "rules": {
    "decision-loop": "error",
    "vague-boundary": "warn",
    "tool-mismatch": "error",
    "missing-fallback": "suggest",
    "cross-file-conflict": "error"
  },
  "tokenBudgetWarning": 500,
  "ignore": [".claude/agents/legacy-*.md"]
}
```

---

## How It Works

```
Your CLAUDE.md
      │
      ├─► Layer 1: Structural parser (regex + AST, zero API cost)
      │         └─► Frontmatter, token counts, format issues
      │
      └─► Layer 2: Semantic evaluator (Claude Sonnet)
                └─► Reads instructions as an agent would
                └─► Identifies conflicts, ambiguities, missing boundaries
                └─► Returns structured JSON → formatted output
```

The semantic layer sends only your instruction file (never your codebase) to the Claude API.  
All analysis runs locally. Nothing is stored.

---

## Roadmap

- [ ] CLI — `npx @chiragdarji/agent-doctor <file>`
- [ ] Structural layer (zero API cost)
- [ ] Semantic layer (Claude Sonnet)
- [ ] MCP server mode
- [ ] `--fix` auto-apply suggestions
- [ ] VS Code extension (inline diagnostics)
- [ ] CI/CD mode (exit code 1 on critical)
- [ ] GitHub Action
- [ ] Rule packs: `cursor-pack`, `claude-code-pack`, `langgraph-pack`
- [ ] Cross-file conflict detection (CLAUDE.md vs AGENTS.md)
- [ ] Watch mode (re-analyse on save)

---

## Why Not cclint / cursor-doctor / AgentLinter?

Those tools are great — use them too. They validate **structure**.

`agent-doctor` validates **semantics**. They're complementary layers, not competitors.

Think of it as:

```
cclint / cursor-doctor  →  "Is this file valid?"
agent-doctor            →  "Will this file work?"
```

---

## Contributing

Early alpha. All contributions welcome — especially:
- New semantic rule ideas (open an issue with a real-world failure case)
- Rule packs for specific frameworks (LangGraph, CrewAI, AutoGen)
- False positive reports

```bash
git clone https://github.com/chiragdarji/agent-doctor
cd agent-doctor
npm install
npm run dev
```

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Related

- [structural-thinking-mcp](https://github.com/chiragdarji/structural-thinking-mcp) — the prompt quality reasoning engine powering `agent-doctor`'s semantic layer
- [cclint](https://github.com/carlrannaberg/cclint) — structural linter for Claude Code projects (complementary)
- [cursor-doctor](https://github.com/nedcodes-ok/cursor-doctor) — structural linter for Cursor rules (complementary)

---

## License

MIT © [Chirag Darji](https://github.com/chiragdarji)

---

_Built because every structural linter said my CLAUDE.md was valid. My agent disagreed._
