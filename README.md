# agent-doctor 🩺

> **Semantic health check for AI agent instruction files.**
> Finds the instructions that will silently break your agent — before your agent runs.

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![npm](https://img.shields.io/badge/npm-0.3.0-black)
![MCP](https://img.shields.io/badge/MCP-server-purple)
![Tests](https://img.shields.io/badge/tests-233%20passing-brightgreen)
![Rules](https://img.shields.io/badge/rules-13%20structural%20%2B%208%20semantic-blue)

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

### Layer 1 — Structural (13 rules, zero API cost)

| Rule | Severity | What it catches |
|------|----------|----------------|
| `missing-frontmatter` | critical | `.mdc` file missing `---` YAML block |
| `unclosed-code-block` | critical | Odd ` ``` ` fences — rest of file read as code |
| `todo-in-instructions` | critical | TODO/FIXME/PLACEHOLDER left in — agent follows literally |
| `missing-always-apply` | warning | `.mdc` where `alwaysApply` is not `true` |
| `missing-description` | warning | `.mdc` with no `description` — Cursor can't match it contextually |
| `conflicting-frontmatter` | warning | `alwaysApply: true` + `globs` set — globs silently ignored |
| `missing-file-glob` | warning | `alwaysApply: false` + no `globs` — rule may never activate |
| `duplicate-heading` | warning | Same heading twice — agent can't pick which wins |
| `legacy-format` | warning | `.cursorrules` file ignored by agent mode |
| `token-budget-exceeded` | warning | Section over configurable token threshold (default 500) |
| `empty-section` | suggestion | Heading with no content and no children |
| `heading-depth-skip` | suggestion | `##` → `####` jump — breaks hierarchy agents use for scoping |
| `negation-heavy` | suggestion | >60% "don't/never/avoid" bullets — rewrite as positive |

### Layer 2 — Semantic (8 rules, LLM-powered)

| Rule | Severity | What it catches |
|------|----------|----------------|
| `decision-loop` | critical | Two rules that conflict on a common task |
| `contradiction` | critical | Rules that directly oppose each other |
| `vague-boundary` | warning | Instructions with no measurable success condition |
| `tool-mismatch` | warning | Tool description doesn't match schema behaviour |
| `missing-fallback` | warning | Conditional with no else/default branch |
| `scope-bleed` | warning | Rule intended for one context leaks into all contexts |
| `over-permissive` | warning | Tool granted with no usage constraint |
| `ambiguous-pronoun` | suggestion | "it", "they", "this" with no clear referent |

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
  --model <id>            Override LLM model (e.g. gpt-4o, claude-opus-4-5)
  --fail-on <severity>    Exit code 1 if issues at this level (default: critical)
  --format <format>       Output format: text | json (default: text)
  --fix                   Auto-fix structural issues in-place
  --dry-run               Preview --fix changes without writing to disk
  --mcp                   Start MCP server mode
  -V, --version           Show version number
  -h, --help              Show help
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

```yaml
# .github/workflows/agent-doctor.yml
name: Agent Instructions Health Check

on: [push, pull_request]

jobs:
  agent-doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
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
      ├─► Layer 1: Structural (13 rules, regex-based, zero API cost)
      │         ├─► Frontmatter validation (missing, conflicting, incomplete)
      │         ├─► Content quality (empty sections, duplicate headings, TODOs)
      │         ├─► Code fence integrity (unclosed blocks)
      │         └─► Token budget per section
      │
      └─► Layer 2: Semantic (8 rules, LLM-powered)
                ├─► Reads instructions as an agent would
                ├─► Detects conflicts, ambiguities, missing boundaries
                └─► Returns structured JSON → Zod-validated → formatted output
```

The semantic layer sends **only your instruction file** (never your codebase) to the LLM API.
All analysis runs locally. Nothing is stored or cached.

---

## Roadmap

- [x] CLI — `npx @chiragdarji/agent-doctor <file>`
- [x] Structural layer — 13 rules, zero API cost
- [x] Semantic layer — 8 rules, Claude + OpenAI
- [x] OpenAI support (`gpt-4o`, `o1-*`, `o3-*`, `o4-*`)
- [x] MCP server — `analyse_agent_file` + `suggest_fix` tools with API key injection
- [x] Programmatic API (`analyse`, `analyseAll`, `discoverFiles`)
- [x] CI/CD mode (exit codes 0/1/2)
- [x] `--fix` — auto-fix structural issues (`todo-in-instructions`, `unclosed-code-block`, `empty-section`)
- [x] `--dry-run` — preview fixes without writing
- [x] Ollama / local LLM support via `provider: "openai-compatible"` + `baseURL`
- [x] Cursor semantic skill (`skills/cursor-semantic-analysis/SKILL.md`)
- [ ] VS Code extension (inline diagnostics)
- [ ] Cross-file conflict detection (CLAUDE.md vs AGENTS.md)
- [ ] Rule packs: `cursor-pack`, `claude-code-pack`, `langgraph-pack`
- [ ] Watch mode (re-analyse on save)

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

When you don't have a separate Anthropic/OpenAI key, use the skill at `skills/cursor-semantic-analysis/SKILL.md` — Cursor's built-in LLM performs the semantic analysis guided by agent-doctor's 8 semantic rules.

```
1. Use agent-doctor MCP: structural analysis on CLAUDE.md
2. Read CLAUDE.md fully
3. Apply agent-doctor semantic rules (from skill)
4. Output findings with health score
```

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
npm run test        # 213 tests
npm run dev         # watch mode
```

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## License

MIT © [Chirag Darji](https://github.com/chiragdarji)

---

_Built because every structural linter said my CLAUDE.md was valid. My agent disagreed._
