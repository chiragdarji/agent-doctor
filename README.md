# agent-doctor 🩺

> **Semantic health check for AI agent instruction files.**
> Finds the instructions that will silently break your agent — before your agent runs.

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![npm](https://img.shields.io/badge/npm-1.0.1-black)
![MCP](https://img.shields.io/badge/MCP-server-purple)
![VS Code](https://img.shields.io/badge/VS%20Code-extension%200.2.1-blue)
![Tests](https://img.shields.io/badge/tests-258%20passing-brightgreen)
![Rules](https://img.shields.io/badge/rules-21%20structural%20%2B%2010%20semantic-blue)
![agent-doctor](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/chiragdarji/agent-doctor/main/badges/agent-doctor.json)

<br/>

![agent-doctor demo](./demo.svg)

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
- TODO: add more constraints here                  ← agent follows this literally
```

No regex catches these. No schema validates them.
They require semantic reasoning — understanding what the agent will *do* with each instruction.

`agent-doctor` uses Claude (or OpenAI) to evaluate your instructions the way your agent will read them.

---

## Quickstart

```bash
# Structural only — no API key needed
npx @chiragdarji/agent-doctor CLAUDE.md --structural-only

# Full analysis with Claude
ANTHROPIC_API_KEY=sk-ant-... npx @chiragdarji/agent-doctor CLAUDE.md

# Full analysis with OpenAI
OPENAI_API_KEY=sk-... npx @chiragdarji/agent-doctor CLAUDE.md --model gpt-4o

# Full analysis with Ollama (no cloud API key)
npx @chiragdarji/agent-doctor CLAUDE.md  # set provider/baseURL in .agentdoctor.json

# Auto-fix structural issues in-place
npx @chiragdarji/agent-doctor CLAUDE.md --fix

# Preview fixes without writing
npx @chiragdarji/agent-doctor CLAUDE.md --fix --dry-run

# Analyse all instruction files in the project
npx @chiragdarji/agent-doctor --all

# Run as MCP server (Claude Code / Cursor)
npx @chiragdarji/agent-doctor --mcp
```

### Example Output

```
agent-doctor 🩺  Analysing CLAUDE.md...

❌  CRITICAL  Incomplete instruction marker "TODO" found
    Line 14: "TODO: add tool constraints here"
    Agent will follow this literally — replace before deploying.
    → Replace the placeholder with the actual instruction.

❌  CRITICAL  Unclosed code fence (```) — everything after line 22 is treated as code
    → Add a closing ``` fence to end the code block.

⚠   WARNING   Heading "Rules" appears more than once (lines 8 and 34)
    → Rename or merge — agents cannot determine which copy takes precedence.

⚠   WARNING   Rule 8 × Rule 12 — Decision loop detected
    Rule 8:  "Always ask before making file changes"
    Rule 12: "Complete tasks autonomously without interruption"
    → Add scope: "Ask only before destructive operations."

💡  SUGGEST   Section "Output Format" has >60% negation-based instructions
    → Rewrite as positive: "Never write long responses" → "Keep responses under 100 words"

────────────────────────────────────────────
Health Score  48 / 100  (D)
Issues        2 critical · 2 warnings · 1 suggestion
Files         CLAUDE.md
Model         claude-sonnet-4-6
────────────────────────────────────────────
```

---

## What It Checks

`agent-doctor` runs two layers of analysis:

### Layer 1 — Structural (21 rules, zero API cost)

| Rule | Severity | What it catches |
|------|----------|----------------|
| `missing-frontmatter` | critical | `.mdc` file missing `---` YAML block |
| `unclosed-code-block` | critical | Odd ` ``` ` fences — rest of file read as code |
| `todo-in-instructions` | critical | TODO/FIXME/PLACEHOLDER left in — agent follows literally |
| `sensitive-data` | critical | API keys, Bearer tokens, AWS/GitHub credentials hardcoded in the file |
| `missing-always-apply` | warning | `.mdc` where `alwaysApply` is not `true` |
| `missing-description` | warning | `.mdc` with no `description` — Cursor can't match it contextually |
| `conflicting-frontmatter` | warning | `alwaysApply: true` + `globs` set — globs silently ignored |
| `missing-file-glob` | warning | `alwaysApply: false` + no `globs` — rule may never activate |
| `duplicate-heading` | warning | Same heading twice — agent can't pick which wins |
| `legacy-format` | warning | `.cursorrules` file ignored by agent mode |
| `token-budget-exceeded` | warning | Section over configurable token threshold (default 500) |
| `missing-success-criteria` | warning | Task section describes work but has no completion signal ("done when", "verify by", "tests pass") |
| `hardcoded-environment` | warning | Absolute paths (`/home/user/…`, `C:\…`) or `localhost:PORT` tie instructions to one machine |
| `missing-agent-persona` | warning | No "You are…" / "Your role is…" identity statement — agent has no grounding |
| `redundant-instructions` | warning | Same directive repeated 3+ times (fuzzy word-overlap dedup) |
| `empty-section` | suggestion | Heading with no content and no children |
| `heading-depth-skip` | suggestion | `##` → `####` jump — breaks hierarchy agents use for scoping |
| `negation-heavy` | suggestion | >60% "don't/never/avoid" bullets — rewrite as positive |
| `missing-tool-list` | suggestion | File references tools by name but has no section enumerating them |
| `missing-examples` | suggestion | Complex multi-condition sections with no code block or inline example |
| `instruction-ordering` | suggestion | Security/constraint sections buried after task sections |

### Layer 2 — Semantic (10 rules, LLM-powered)

| Rule | Severity | What it catches |
|------|----------|----------------|
| `decision-loop` | critical | Two rules that conflict on a common task |
| `contradiction` | critical | Rules that directly oppose each other |
| `vague-boundary` | warning | Instructions with no measurable success condition |
| `tool-mismatch` | warning | Tool description doesn't match schema behaviour |
| `missing-fallback` | warning | Conditional with no else/default branch |
| `scope-bleed` | warning | Rule intended for one context leaks into all contexts |
| `over-permissive` | warning | Tool granted with no usage constraint |
| `missing-recovery-strategy` | warning | Destructive operation (deploy, delete, migrate) with no rollback or error handling |
| `unobservable-outcome` | warning | Task described with no way to verify it completed correctly |
| `ambiguous-pronoun` | suggestion | "it", "they", "this" with no clear referent |

### Agent Readiness Score

Every result includes a **Readiness Score** (0–100) alongside the Health Score, broken down across five dimensions from the [Factory.ai Agent Readiness](https://factory.ai/news/agent-readiness) framework and [OpenAI Harness Engineering](https://openai.com/index/harness-engineering/) principles:

| Dimension | What it measures | Rules that affect it |
|-----------|-----------------|----------------------|
| **Observable** | Can the agent verify its work completed correctly? | `unobservable-outcome`, `missing-success-criteria` |
| **Bounded** | Is the scope and task clearly defined? | `vague-boundary`, `missing-fallback`, `scope-bleed`, `hardcoded-environment`, `missing-success-criteria` |
| **Reversible** | Are risky operations guarded with recovery guidance? | `missing-recovery-strategy`, `over-permissive` |
| **Tooled** | Are available tools listed and accurately described? | `missing-tool-list`, `tool-mismatch` |
| **Documented** | Is enough context provided for decisions? | `todo-in-instructions`, `empty-section`, `ambiguous-pronoun` |

The readiness score appears in the CLI footer and JSON output:

```
────────────────────────────────────────────
Health Score   72 / 100  (C)
Readiness      60 / 100  obs 80 · bnd 45 · rev 100 · tld 80 · doc 100
Issues         1 critical · 3 warnings · 1 suggestion
Files          CLAUDE.md
Model          claude-sonnet-4-6
────────────────────────────────────────────
```

The readiness score is **derived from existing issue findings** — no extra API call is made.

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
| `.windsurfrules` | Windsurf IDE |
| `.roo/rules/*.md` | Roo-code |

---

## MCP Integration

`agent-doctor` runs as an MCP server so you can call it from **inside Claude Code or Cursor**.
Pass your API key directly as a tool input — no environment variables needed.

### Setup

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

### Tool: `analyse_agent_file`

Runs structural + semantic analysis on any instruction file.

```json
{
  "filePath": "CLAUDE.md",
  "layers": ["structural", "semantic"],
  "model": "claude-sonnet-4-6",
  "anthropicApiKey": "sk-ant-...",
  "openaiApiKey": "sk-..."
}
```

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `filePath` | string | ✅ | Path to the instruction file |
| `layers` | array | — | `["structural","semantic"]` (default: both) |
| `model` | string | — | e.g. `claude-sonnet-4-6`, `gpt-4o` |
| `anthropicApiKey` | string | — | Falls back to `ANTHROPIC_API_KEY` env var |
| `openaiApiKey` | string | — | Falls back to `OPENAI_API_KEY` env var |

> **No API key?** Omit `anthropicApiKey`/`openaiApiKey` and set `layers: ["structural"]` for free analysis.

### Tool: `suggest_fix`

Returns a built-in fix suggestion + LLM-generated before/after rewrite for a specific rule.

```json
{
  "filePath": "CLAUDE.md",
  "issueRuleId": "todo-in-instructions",
  "anthropicApiKey": "sk-ant-..."
}
```

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `filePath` | string | ✅ | Path to the instruction file |
| `issueRuleId` | string | ✅ | Rule ID from `analyse_agent_file` output |
| `anthropicApiKey` / `openaiApiKey` | string | — | Enables LLM-generated rewrite |

---

## Configuration

```json
// .agentdoctor.json
{
  "$schema": "./agent-doctor.schema.json",
  "model": "claude-sonnet-4-6",
  "layers": ["structural", "semantic"],
  "rules": {
    "negation-heavy": "off",
    "heading-depth-skip": "off",
    "missing-always-apply": "off"
  },
  "tokenBudgetWarning": 500,
  "ignore": [".claude/agents/legacy-*.md"],
  "failOn": "critical"
}
```

Add `"$schema": "./agent-doctor.schema.json"` for IDE autocomplete and inline validation of all config options. The schema file ships with the package.

**Using OpenAI:**
```json
{
  "model": "gpt-4o",
  "provider": "openai"
}
```

**Using Ollama or any local LLM (no cloud API key needed):**
```json
{
  "provider": "openai-compatible",
  "baseURL": "http://localhost:11434/v1",
  "model": "llama3.1",
  "layers": ["structural", "semantic"]
}
```

Requires Ollama running locally: `ollama pull llama3.1`. See `examples/ollama-config.json` for a ready-to-use config.

**Provider selection (priority order):**
1. `provider` field in config — explicit override
2. Model name prefix: `gpt-*`, `o1-*`, `o3-*`, `o4-*` → OpenAI; else → Anthropic
3. API key present: `ANTHROPIC_API_KEY` → Anthropic, `OPENAI_API_KEY` → OpenAI

---

## CLI Reference

```bash
agent-doctor [file] [options]

Arguments:
  file                    Path to instruction file (auto-detects CLAUDE.md if omitted)

Options:
  --all                   Discover and analyse all instruction files in the project
  --structural-only       Skip semantic layer — no API key required
  --model <id>            Override LLM model (e.g. gpt-4o, claude-opus-4-8)
  --fail-on <severity>    Exit code 1 if issues at this level (default: critical)
  --format <format>       Output format: text | json (default: text)
  --readiness-report      Detailed per-dimension readiness breakdown instead of issue list
  --fix                   Auto-fix structural issues in-place
  --dry-run               Preview --fix changes without writing to disk
  --watch                 Re-run analysis on every file save — Ctrl+C to stop
  --history [n]           Score trend table across last n git commits (default: 10)
  --compare <ref>         Side-by-side diff against a git ref (e.g. HEAD~1) or another file
  --gate                  Orchestrator gate mode — JSON pass/fail output, zero LLM cost
  --org [dir]             Org-level health dashboard — recursively discovers all files under dir
  --init                  Scaffold a new instruction file from template
  --type <type>           Template type for --init: claude | cursor | agents
  --force                 Overwrite existing file with --init
  --mcp                   Start MCP server mode
  -V, --version           Show version number
  -h, --help              Show help
```

### Score history

```bash
# Show score trend for the last 10 commits
npx @chiragdarji/agent-doctor CLAUDE.md --history

# Last 20 commits, JSON output for CI
npx @chiragdarji/agent-doctor CLAUDE.md --history 20 --format json
```

### Org-level dashboard

```bash
# Scan entire workspace
npx @chiragdarji/agent-doctor --org

# Scan a monorepo subdirectory
npx @chiragdarji/agent-doctor --org ./packages

# JSON output for dashboards
npx @chiragdarji/agent-doctor --org --format json
```

**Exit codes:**
| Code | Meaning |
|------|---------|
| `0` | No issues at or above `--fail-on` threshold |
| `1` | Issues found at or above threshold |
| `2` | File not found / parse error |

---

## CI / CD Integration

### GitHub Actions

One-line setup using the native action:

```yaml
# .github/workflows/agent-doctor.yml
name: Agent Instructions Health Check

on: [push, pull_request]

jobs:
  agent-doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: chiragdarji/agent-doctor@v1
        with:
          fail-on: warning
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}   # optional
```

Available inputs:

| Input | Default | Description |
|-------|---------|-------------|
| `files` | _(auto-detect)_ | Space-separated file paths to analyse |
| `fail-on` | `critical` | Severity threshold for non-zero exit |
| `structural-only` | `false` | Skip LLM layer — no API key needed |
| `model` | `claude-sonnet-4-6` | Override LLM model |
| `anthropic-api-key` | — | Falls back to `ANTHROPIC_API_KEY` env var |
| `openai-api-key` | — | Falls back to `OPENAI_API_KEY` env var |

Action outputs: `score`, `grade`, `issues-count`, `readiness-score`.

Or use `npx` directly:

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Structural check (no API key needed)
        run: npx @chiragdarji/agent-doctor --all --structural-only --fail-on warning
      - name: Semantic check (optional — needs API key)
        if: env.ANTHROPIC_API_KEY != ''
        run: npx @chiragdarji/agent-doctor --all --fail-on critical
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### JSON output for downstream processing

```bash
npx @chiragdarji/agent-doctor CLAUDE.md --format json \
  | jq '.issues[] | select(.severity == "critical")'
```

---

## Programmatic API

```bash
npm install @chiragdarji/agent-doctor
```

### Basic usage

```typescript
import { analyse, loadConfig } from '@chiragdarji/agent-doctor';

const config = loadConfig(process.cwd());
const result = await analyse('./CLAUDE.md', config);

console.log(result.score);   // 0–100
console.log(result.grade);   // 'A' | 'B' | 'C' | 'D' | 'F'
console.log(result.issues);  // Issue[]
```

### Structural-only (no API key)

```typescript
import { analyse, DEFAULT_CONFIG } from '@chiragdarji/agent-doctor';

const result = await analyse('./CLAUDE.md', {
  ...DEFAULT_CONFIG,
  layers: ['structural'],
});
```

### Inject a custom LLM client

```typescript
import { analyseSemantics, createAnthropicClient, createOpenAIClient } from '@chiragdarji/agent-doctor';

// Anthropic
const client = createAnthropicClient(process.env.ANTHROPIC_API_KEY!);
// OpenAI
const client = createOpenAIClient(process.env.OPENAI_API_KEY!);

const issues = await analyseSemantics(content, filePath, config, client);
```

### Silence specific rules

```typescript
const config = {
  ...loadConfig(process.cwd()),
  rules: {
    'negation-heavy': 'off',
    'heading-depth-skip': 'off',
  },
  failOn: 'warning',
};
```

### Result shape

```typescript
interface AnalysisResult {
  file: string;
  score: number;          // 0–100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: Issue[];
  tokenCount: number;
  analysedAt: string;     // ISO timestamp
  layers: ('structural' | 'semantic')[];
  readinessScore: number; // 0–100, average of 5 dimensions
  readinessDimensions: {
    observable: number;   // can outcomes be verified?
    bounded: number;      // is scope clearly defined?
    reversible: number;   // are risky ops guarded?
    tooled: number;       // are tools listed/described?
    documented: number;   // is context provided?
  };
}

interface Issue {
  ruleId: RuleId;
  severity: 'critical' | 'warning' | 'suggestion';
  message: string;
  suggestion: string;
  line?: number;
  context?: string;
  relatedLine?: number;
}
```

---

## Custom Rule Plugins

You can ship your own structural rules as a plugin — no fork needed.

### 1. Write a plugin module

```js
// rules/no-emoji.js  (ESM)
export default function noEmoji(content, filePath) {
  const emojiPattern = /\p{Emoji}/u;
  if (emojiPattern.test(content)) {
    return [{
      ruleId: 'my-org/no-emoji',
      severity: 'warning',
      message: 'Emoji found in instruction file',
      suggestion: 'Replace emoji with plain text — some agents strip them',
    }];
  }
  return [];
}
```

A plugin module may export:
- A **default function** (single rule)
- **Named functions** (multiple rules — every exported function is treated as a rule)

Each rule receives `(content: string, filePath: string)` and returns an `Issue[]`-shaped array. The `ruleId` can be any string; namespacing with `my-org/` is recommended to avoid collisions.

### 2. Register in `.agentdoctor.json`

```json
{
  "plugins": [
    "./rules/no-emoji.js",
    "@my-org/agent-doctor-rules"
  ]
}
```

Relative paths resolve from the directory where you run the CLI. Bare specifiers are resolved as npm packages.

### 3. Disable a plugin rule

```json
{
  "rules": {
    "my-org/no-emoji": "off"
  }
}
```

Plugin rule IDs work identically to built-in rule IDs in `config.rules`.

### TypeScript plugin authoring

```typescript
import type { PluginRule } from '@chiragdarji/agent-doctor';

export const noEmoji: PluginRule = (content) => { ... };
```

---

## Adding a New Structural Rule

1. Create `src/rules/structural/<rule-id>.ts`:

```typescript
import type { Issue, StructuralRule } from '../../types.js';

/** Detects ... */
export const myRule: StructuralRule = (content, filePath) => {
  return []; // return Issue[] to flag, [] to pass
};
```

2. Export from `src/rules/structural/index.ts`
3. Add to `rules` array in `src/analyser/structural.ts`
4. Add `RuleId` to `src/types.ts`
5. Add tests in `tests/structural.test.ts`

---

## How It Works

```
Your CLAUDE.md / AGENTS.md / .mdc
      │
      ├─► Layer 1: Structural (21 rules, regex-based, zero API cost)
      │         ├─► Frontmatter validation (missing, conflicting, incomplete)
      │         ├─► Content quality (empty sections, duplicate headings, TODOs)
      │         ├─► Security (credentials, sensitive data)
      │         ├─► Code fence integrity (unclosed blocks)
      │         ├─► Agent readiness (persona, success criteria, hardcoded env, tool lists)
      │         ├─► Instruction hygiene (redundant rules, missing examples, ordering)
      │         └─► Token budget per section
      │
      └─► Layer 2: Semantic (10 rules, LLM-powered)
                ├─► Reads instructions as an agent would
                ├─► Detects conflicts, ambiguities, missing boundaries
                ├─► Flags missing recovery strategies and unverifiable outcomes
                └─► Returns structured JSON → Zod-validated → formatted output
```

The semantic layer sends **only your instruction file** (never your codebase) to the LLM API.
All analysis runs locally. Nothing is stored or cached.

---

## Roadmap

- [x] CLI — `npx @chiragdarji/agent-doctor <file>`
- [x] Structural layer — 16 rules, zero API cost
- [x] Semantic layer — 10 rules, Claude + OpenAI
- [x] Agent Readiness Score — 5-dimension breakdown (observable / bounded / reversible / tooled / documented)
- [x] OpenAI support (`gpt-4o`, `o1-*`, `o3-*`, `o4-*`)
- [x] MCP server — `analyse_agent_file` + `suggest_fix` tools with API key injection
- [x] Programmatic API (`analyse`, `analyseAll`, `discoverFiles`)
- [x] CI/CD mode (exit codes 0/1/2)
- [x] `--fix` — auto-fix structural issues (`todo-in-instructions`, `unclosed-code-block`, `empty-section`)
- [x] `--dry-run` — preview fixes without writing
- [x] Ollama / local LLM support via `provider: "openai-compatible"` + `baseURL`
- [x] Cursor semantic skill (`skills/cursor-semantic-analysis/SKILL.md`)
- [x] `--watch` mode (re-analyse on save)
- [x] `--init` scaffold generator (CLAUDE.md, AGENTS.md, Cursor .mdc templates)
- [x] Cross-file conflict detection (CLAUDE.md vs AGENTS.md)
- [x] Custom rule plugins
- [x] VS Code extension (inline diagnostics, Quick Fix, semantic on demand)
- [x] Native GitHub Actions action (`chiragdarji/agent-doctor@v1`)
- [x] `--history [n]` — score trending across git commits
- [x] Platform-aware analysis — suggestions adapt to Anthropic / OpenAI / Cursor / Gemini / Copilot
- [x] `--org [dir]` — workspace-level health dashboard with per-dimension breakdown

---

## Auto-Fix (`--fix`)

`agent-doctor` can repair common structural issues automatically:

```bash
# Fix issues in-place
npx @chiragdarji/agent-doctor CLAUDE.md --fix

# Preview changes before writing
npx @chiragdarji/agent-doctor CLAUDE.md --fix --dry-run
```

| Rule | Fix action |
|------|-----------|
| `todo-in-instructions` | Replaces TODO line with `<!-- TODO removed by agent-doctor — replace with actual instruction -->` |
| `unclosed-code-block` | Appends closing ` ``` ` fence at end of file |
| `empty-section` | Inserts `_No content yet — add instructions here._` after the heading |
| `missing-success-criteria` | Appends `> ✅ **Success criteria:** Done when _<describe outcome>_` at end of section |
| `sensitive-data` | Replaces matched credentials with `[REDACTED]` (key= prefix preserved) |
| `missing-agent-persona` | Prepends persona stub after frontmatter (or at top of file) |
| `hardcoded-environment` | Replaces absolute paths with `$HOME` / `${PROJECT_ROOT}` / `$PORT` |
| `legacy-format` | Skipped — prints rename instruction; file rename must be manual |

---

## Cursor Integration

`agent-doctor` works inside Cursor as an MCP server. For semantic analysis without a separate API key, use the included skill that lets Cursor's own LLM apply agent-doctor's semantic rules.

### Setup (Cursor MCP)

Copy `examples/cursor-mcp.json` to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "agent-doctor": {
      "command": "npx",
      "args": ["@chiragdarji/agent-doctor", "--mcp"],
      "env": {}
    }
  }
}
```

### Cursor Semantic Analysis Skill

When you don't have a separate Anthropic/OpenAI key, use the skill at `skills/cursor-semantic-analysis/SKILL.md` — Cursor's built-in LLM performs the semantic analysis guided by agent-doctor's 10 semantic rules.

```
1. Use agent-doctor MCP: structural analysis on CLAUDE.md
2. Read CLAUDE.md fully
3. Apply agent-doctor semantic rules (from skill)
4. Output findings with health score
```

---

## VS Code Extension

Install **Agent Doctor** from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=chiragdarji.vscode-agent-doctor) for inline diagnostics without leaving the editor.

### Features

- **On-save structural analysis** — red/yellow/blue squiggles appear instantly on every save, zero API cost
- **Problems panel** — all issues listed with rule ID, line, and message
- **Quick Fix** (`Ctrl+.` / `Cmd+.`) — one-click auto-fix for 7 rules:
  - `sensitive-data` → redact credential
  - `missing-agent-persona` → prepend persona stub
  - `hardcoded-environment` → replace path with env variable
  - `todo-in-instructions` → replace with HTML comment
  - `unclosed-code-block` → append closing fence
  - `empty-section` → insert placeholder
  - `missing-success-criteria` → insert success criteria stub
- **Run Full Analysis** command — runs structural + semantic (LLM) analysis on the active file
- **Run Structural Analysis** command — force-refresh diagnostics

### Install

```
ext install chiragdarji.vscode-agent-doctor
```

Or search **Agent Doctor** in the Extensions panel (`Ctrl+Shift+X`).

### Settings

```json
{
  "agentDoctor.anthropicApiKey": "sk-ant-...",
  "agentDoctor.openaiApiKey": "sk-...",
  "agentDoctor.model": "claude-sonnet-4-6",
  "agentDoctor.enableOnSave": true,
  "agentDoctor.failOnSeverity": "critical"
}
```

`enableOnSave: true` runs structural analysis on every save. Set `failOnSeverity` to control which issues show as errors vs. warnings/hints in the Problems panel.

---

## Ollama / Local LLM Support

Run full semantic analysis with no cloud API key using Ollama or any OpenAI-compatible endpoint:

```bash
# 1. Start Ollama and pull a model
ollama pull llama3.1

# 2. Copy the example config
cp examples/ollama-config.json .agentdoctor.json

# 3. Run analysis
npx @chiragdarji/agent-doctor CLAUDE.md
```

`.agentdoctor.json`:
```json
{
  "provider": "openai-compatible",
  "baseURL": "http://localhost:11434/v1",
  "model": "llama3.1",
  "layers": ["structural", "semantic"]
}
```

Works with any OpenAI-compatible server: Ollama, LM Studio, vLLM, llama.cpp.

---

## Why Not cclint / cursor-doctor / AgentLinter?

Those tools validate **structure**. `agent-doctor` validates **semantics**. They're complementary:

```
cclint / cursor-doctor  →  "Is this file valid?"
agent-doctor            →  "Will this file work?"
```

---

## Contributing

```bash
git clone https://github.com/chiragdarji/agent-doctor
cd agent-doctor
npm install
npm run test        # 258 tests
npm run dev         # watch mode
```

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## License

MIT © [Chirag Darji](https://github.com/chiragdarji)

---

_Built because every structural linter said my CLAUDE.md was valid. My agent disagreed._
