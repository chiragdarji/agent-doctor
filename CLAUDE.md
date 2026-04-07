# agent-doctor — CLAUDE.md

## Project Overview

`agent-doctor` is a CLI tool + MCP server that performs semantic health checks on AI agent
instruction files (CLAUDE.md, AGENTS.md, .cursor/rules/*.mdc, GEMINI.md).

It runs two layers:
1. **Structural layer** — 13 rules, zero API cost, regex/AST-based checks
2. **Semantic layer** — LLM-powered (Claude or OpenAI), finds instruction conflicts, ambiguities, broken logic

Built with TypeScript + Node.js. Distributed as an npm package (`npx @chiragdarji/agent-doctor`).
Also exposes an MCP server for use inside Claude Code and Cursor.

---

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript (strict mode)
- **CLI framework**: Commander.js
- **Testing**: Vitest (233 tests)
- **LLM**: Anthropic SDK (`@anthropic-ai/sdk`) or OpenAI SDK (`openai`) — provider auto-detected from model name; `openai-compatible` for Ollama/local LLMs
- **MCP**: `@modelcontextprotocol/sdk`
- **Package manager**: npm
- **Build**: tsup (via `tsup.config.ts`)
- **Lint**: ESLint + Prettier

---

## Commands

```bash
npm run dev          # tsx watch mode
npm run build        # tsup → dist/ (with postbuild chmod +x)
npm run test         # vitest watch
npm run test:run     # vitest run (CI)
npm run lint         # eslint src --ext .ts
npm run format       # prettier --write src tests
npm run typecheck    # tsc --noEmit
```

---

## Project Structure

```
agent-doctor/
├── src/
│   ├── cli.ts                  # Commander.js entry — shebang injected by tsup banner
│   ├── index.ts                # Programmatic API exports
│   ├── fixer.ts                # --fix: applyFixes() for todo/unclosed/empty-section
│   ├── mcp-server.ts           # Full MCP server (analyse_agent_file + suggest_fix)
│   ├── analyser/
│   │   ├── index.ts            # Orchestrates structural + semantic layers
│   │   ├── structural.ts       # Runs all 13 structural rules
│   │   ├── semantic.ts         # LLM analysis (Zod-validated JSON output)
│   │   ├── llm-client.ts       # Unified LLMClient interface + Anthropic/OpenAI adapters
│   │   └── semantic-prompt.ts  # System prompt for semantic analysis
│   ├── parser/
│   │   ├── index.ts            # Routes to correct parser by file type
│   │   ├── markdown.ts         # CLAUDE.md / AGENTS.md parser (js-yaml, no eval)
│   │   ├── mdc.ts              # .cursor/rules/*.mdc parser (YAML frontmatter)
│   │   └── sections.ts         # Splits content into Section[] by heading
│   ├── rules/
│   │   └── structural/         # One file per structural rule (13 total)
│   │       ├── missing-frontmatter.ts
│   │       ├── missing-always-apply.ts
│   │       ├── missing-description.ts
│   │       ├── conflicting-frontmatter.ts
│   │       ├── missing-file-glob.ts
│   │       ├── legacy-format.ts
│   │       ├── empty-section.ts
│   │       ├── duplicate-heading.ts
│   │       ├── heading-depth-skip.ts
│   │       ├── unclosed-code-block.ts
│   │       ├── negation-heavy.ts
│   │       ├── todo-in-instructions.ts
│   │       ├── token-budget-exceeded.ts
│   │       └── index.ts
│   ├── output/
│   │   ├── formatter.ts        # Console output (chalk)
│   │   └── reporter.ts         # JSON / Markdown report generation
│   ├── config.ts               # .agentdoctor.json loader
│   ├── discovery.ts            # Auto-discovers agent instruction files
│   ├── tokens.ts               # tiktoken wrapper
│   ├── logger.ts               # Structured logger
│   └── types.ts                # All shared TypeScript types
├── tests/
│   ├── fixtures/               # Sample files for structural rule tests
│   ├── structural.test.ts      # 80+ tests across 13 rules
│   ├── semantic.test.ts        # 20 tests (injected LLMClient)
│   ├── llm-client.test.ts      # 31 tests (inferProvider, adapters, openai-compatible)
│   ├── fixer.test.ts           # 20 tests (applyFixes per rule + combined)
│   ├── parser.test.ts          # 36 tests
│   ├── analyser.test.ts        # 14 tests
│   ├── formatter.test.ts       # 17 tests
│   ├── config.test.ts          # 7 tests
│   └── discovery.test.ts       # 13 tests
├── examples/
│   ├── cursor-mcp.json         # .cursor/mcp.json setup
│   ├── claude-settings.json    # .claude/settings.json setup
│   └── ollama-config.json      # Local LLM config
├── skills/
│   └── cursor-semantic-analysis/
│       └── SKILL.md            # Cursor skill for semantic analysis without extra API key
├── scripts/
│   └── release.sh              # Release checklist script
├── CHANGELOG.md
├── CLAUDE.md                   # This file
├── README.md
├── package.json
├── tsup.config.ts              # CLI gets shebang banner; library entry does not
├── vitest.config.ts            # pool: 'forks' (avoids tiktoken WASM crash)
└── .agentdoctor.json           # Default config
```

---

## Core Types

```typescript
type Severity = 'critical' | 'warning' | 'suggestion';

type RuleId =
  // Semantic rules
  | 'decision-loop' | 'vague-boundary' | 'tool-mismatch' | 'missing-fallback'
  | 'scope-bleed' | 'contradiction' | 'ambiguous-pronoun' | 'over-permissive'
  | 'cross-file-conflict'
  // Structural rules
  | 'missing-frontmatter' | 'missing-always-apply' | 'missing-description'
  | 'conflicting-frontmatter' | 'missing-file-glob' | 'legacy-format'
  | 'token-budget-exceeded' | 'empty-section' | 'duplicate-heading'
  | 'heading-depth-skip' | 'unclosed-code-block' | 'negation-heavy'
  | 'todo-in-instructions';

interface Issue {
  ruleId: RuleId;
  severity: Severity;
  message: string;
  suggestion: string;
  line?: number;
  context?: string;       // offending text snippet
  relatedLine?: number;   // for cross-rule / duplicate conflicts
}

interface AnalysisResult {
  file: string;
  score: number;           // 0–100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: Issue[];
  tokenCount: number;
  analysedAt: string;      // ISO timestamp
  layers: AnalysisLayer[];
}
```

---

## Structural Rules (Layer 1) — 13 rules

```typescript
type StructuralRule = (content: string, filePath: string) => Issue[];
```

| Rule | Severity | File target | Description |
|------|----------|-------------|-------------|
| `missing-frontmatter` | critical | `.mdc` | No `---` YAML block |
| `unclosed-code-block` | critical | all | Odd ` ``` ` or `~~~` fences |
| `todo-in-instructions` | critical | all | TODO/FIXME/PLACEHOLDER/TBD/XXX found |
| `missing-always-apply` | warning | `.mdc` | `alwaysApply` not `true` |
| `missing-description` | warning | `.mdc` | No `description` in frontmatter |
| `conflicting-frontmatter` | warning | `.mdc` | `alwaysApply: true` + `globs` both set |
| `missing-file-glob` | warning | `.mdc` | `alwaysApply: false` + no `globs` |
| `duplicate-heading` | warning | all | Same heading text appears twice |
| `legacy-format` | warning | all | `.cursorrules` file |
| `token-budget-exceeded` | warning | all | Section exceeds token threshold (configurable) |
| `empty-section` | suggestion | all | Heading with no content and no child headings |
| `heading-depth-skip` | suggestion | all | e.g. `##` → `####` (skips level) |
| `negation-heavy` | suggestion | all | >60% of bullets use "don't/never/avoid" |

---

## Semantic Analysis (Layer 2)

```typescript
interface LLMClient {
  complete(params: {
    model: string;
    system: string;
    messages: LLMMessage[];
    maxTokens: number;
  }): Promise<LLMResponse>;
}

// Factory — auto-selects provider from model name or config.provider override
createClientFromConfig(config: Config): LLMClient | null

async function analyseSemantics(
  content: string,
  filePath: string,
  config: Config,
  client?: LLMClient   // injectable for tests
): Promise<Issue[]>
```

**Provider selection (priority order):**
1. `client` param injected directly (tests + MCP server)
2. `config.provider` explicit override (`'anthropic'` | `'openai'` | `'openai-compatible'`)
3. Inferred from `config.model` prefix (`gpt-*`, `o1-*`, `o3-*`, `o4-*` → OpenAI)
4. Default: Anthropic

**`openai-compatible` provider:**
- Requires `config.baseURL` (e.g. `"http://localhost:11434/v1"`)
- Uses OpenAI SDK with `baseURL` override — works with Ollama, LM Studio, vLLM
- Falls back to `apiKey: "ollama"` if no `OPENAI_API_KEY` set (Ollama ignores it)

---

## Auto-Fix (`--fix` / `applyFixes`)

```typescript
export async function applyFixes(
  filePath: string,
  issues: Issue[],
  options?: { dryRun?: boolean },
): Promise<FixResult>

export interface FixResult {
  fixed: RuleId[];
  skipped: RuleId[];
  preview?: string;  // only present in dry-run mode
}
```

| Rule | Fix action |
|------|-----------|
| `todo-in-instructions` | Replaces TODO line with HTML comment |
| `unclosed-code-block` | Appends closing ` ``` ` fence at EOF |
| `empty-section` | Inserts placeholder after heading (reverse order) |
| `legacy-format` | Skipped — always manual (destructive file rename) |
| all others | Skipped — no auto-fix available |

---

## MCP Server

Two tools exposed:

**`analyse_agent_file`**
- `filePath` (required)
- `layers?: ('structural' | 'semantic')[]`
- `model?: string`
- `anthropicApiKey?: string` — falls back to `ANTHROPIC_API_KEY` env
- `openaiApiKey?: string` — falls back to `OPENAI_API_KEY` env
- Graceful downgrade: semantic requested + no key → structural only

**`suggest_fix`**
- `filePath` (required)
- `issueRuleId` (required)
- `anthropicApiKey? / openaiApiKey? / model?`
- Returns built-in suggestion + LLM before/after rewrite when key provided

---

## CLI Behaviour

```bash
npx @chiragdarji/agent-doctor CLAUDE.md               # auto semantic
npx @chiragdarji/agent-doctor CLAUDE.md --structural-only  # no API key
npx @chiragdarji/agent-doctor --all                   # discover all files
npx @chiragdarji/agent-doctor CLAUDE.md --model gpt-4o
npx @chiragdarji/agent-doctor CLAUDE.md --fail-on warning
npx @chiragdarji/agent-doctor CLAUDE.md --format json
npx @chiragdarji/agent-doctor CLAUDE.md --fix         # auto-fix structural issues
npx @chiragdarji/agent-doctor CLAUDE.md --fix --dry-run   # preview fixes
npx @chiragdarji/agent-doctor --mcp                   # start MCP server
```

Exit codes: `0` = pass, `1` = issues found, `2` = file error

---

## Coding Standards

- TypeScript strict mode always — no `any`
- Named exports everywhere — no default exports except CLI entry
- All async functions must have try/catch with typed errors
- Never use `console.log` in library code — use the `logger` interface
- Every public function needs a JSDoc comment
- Tests live in `tests/` mirroring `src/` structure
- Fixtures for test cases go in `tests/fixtures/`
- `gray-matter` is banned — use `js-yaml` safe `load()` directly

---

## Environment Variables

```bash
ANTHROPIC_API_KEY=         # required for semantic layer with Claude models
OPENAI_API_KEY=            # required for semantic layer with OpenAI models (gpt-*, o1-*, o3-*, o4-*)
AGENT_DOCTOR_MODEL=        # optional, default: claude-sonnet-4-6
AGENT_DOCTOR_LOG_LEVEL=    # optional: debug | info | warn | error
```

The provider is inferred from the model name. Only the matching key is required.
MCP tool inputs can supply keys directly — env vars are the fallback.
For `openai-compatible` (Ollama, etc.), no API key is required — `OPENAI_API_KEY` falls back to `"ollama"`.

---

## Key Architecture Decisions

- **`gray-matter` removed** — replaced with `js-yaml.load()` + regex frontmatter splitter (eliminates eval() CVE)
- **Dependency injection for LLMClient** — `analyseSemantics` accepts optional `client?` param, avoiding `vi.mock` ESM hoisting issues in tests
- **`vitest.config.ts` with `pool: 'forks'`** — avoids tiktoken WASM crash in worker threads
- **`tsup.config.ts`** — CLI entry gets `banner: { js: '#!/usr/bin/env node' }` and `postbuild` runs `chmod +x dist/cli.js`; library entry has no shebang
- **`declare const __CLI_VERSION__`** — version injected at build time via tsup `define`, reads from `package.json`

---

## What NOT To Do

- Do not add a web UI — this is a CLI + MCP tool only
- Do not store or cache API responses
- Do not send anything other than the instruction file to the LLM API
- Do not create a `.agentdoctor/` directory in the user's project
- Do not require configuration to run — zero-config must work out of the box
- Do not use `any` type
- Do not swallow errors silently
- Do not use `gray-matter` — it uses `eval()` internally
