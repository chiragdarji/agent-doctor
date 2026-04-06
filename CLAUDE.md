# agent-doctor — CLAUDE.md

## Project Overview

`agent-doctor` is a CLI tool + MCP server that performs semantic health checks on AI agent
instruction files (CLAUDE.md, AGENTS.md, .cursor/rules/*.mdc, GEMINI.md).

It runs two layers:
1. **Structural layer** — fast, zero API cost, regex/AST-based checks
2. **Semantic layer** — Claude Sonnet-powered, finds instruction conflicts, ambiguities, broken logic

Built with TypeScript + Node.js. Distributed as an npm package (`npx agent-doctor`).
Also exposes an MCP server for use inside Claude Code and Cursor.

---

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript (strict mode)
- **CLI framework**: Commander.js
- **Testing**: Vitest
- **LLM**: Anthropic SDK (`@anthropic-ai/sdk`) — claude-sonnet-4-6
- **MCP**: `@modelcontextprotocol/sdk`
- **Package manager**: npm
- **Build**: tsup
- **Lint**: ESLint + Prettier

---

## Commands

```bash
npm run dev          # ts-node watch mode
npm run build        # tsup → dist/
npm run test         # vitest
npm run lint         # eslint
npm run format       # prettier --write
npm run typecheck    # tsc --noEmit
```

---

## Project Structure

```
agent-doctor/
├── src/
│   ├── cli.ts                  # Commander.js entry point
│   ├── index.ts                # Programmatic API export
│   ├── mcp-server.ts           # MCP server entry point
│   ├── analyser/
│   │   ├── index.ts            # Orchestrates both layers
│   │   ├── structural.ts       # Layer 1: fast structural checks
│   │   └── semantic.ts         # Layer 2: Claude Sonnet analysis
│   ├── parser/
│   │   ├── index.ts            # Routes to correct parser by file type
│   │   ├── markdown.ts         # CLAUDE.md / AGENTS.md parser
│   │   └── mdc.ts              # .cursor/rules/*.mdc parser (YAML frontmatter)
│   ├── rules/
│   │   ├── structural/         # One file per structural rule
│   │   └── semantic/           # Semantic rule definitions (fed to Claude)
│   ├── output/
│   │   ├── formatter.ts        # Console output formatting
│   │   └── reporter.ts         # JSON / Markdown report generation
│   ├── config.ts               # .agentdoctor.json loader
│   └── types.ts                # Shared TypeScript types
├── tests/
│   ├── fixtures/               # Sample CLAUDE.md files for testing
│   ├── structural.test.ts
│   └── semantic.test.ts
├── CLAUDE.md                   # This file
├── README.md
├── package.json
├── tsconfig.json
└── .agentdoctor.json           # Default config
```

---

## Core Types

Always use these types from `src/types.ts`:

```typescript
type Severity = 'critical' | 'warning' | 'suggestion';

type RuleId =
  | 'decision-loop'
  | 'vague-boundary'
  | 'tool-mismatch'
  | 'missing-fallback'
  | 'scope-bleed'
  | 'contradiction'
  | 'ambiguous-pronoun'
  | 'over-permissive'
  | 'cross-file-conflict'
  // structural
  | 'missing-frontmatter'
  | 'missing-always-apply'
  | 'legacy-format'
  | 'token-budget-exceeded'
  | 'empty-section';

interface Issue {
  ruleId: RuleId;
  severity: Severity;
  message: string;
  suggestion: string;
  line?: number;
  context?: string;       // the offending text snippet
  relatedLine?: number;   // for cross-rule conflicts
}

interface AnalysisResult {
  file: string;
  score: number;           // 0–100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: Issue[];
  tokenCount: number;
  analysedAt: string;      // ISO timestamp
}
```

---

## Structural Rules (Layer 1)

Implement each as a function in `src/rules/structural/`:

```typescript
// signature every structural rule must follow
type StructuralRule = (content: string, filePath: string) => Issue[];
```

Rules to implement first:
- `missing-frontmatter` — `.mdc` files missing `---` YAML block
- `missing-always-apply` — `.mdc` files where `alwaysApply` is not `true`
- `legacy-format` — file is `.cursorrules` (not `.mdc`)
- `token-budget-exceeded` — section exceeds 500 tokens (configurable)
- `empty-section` — heading with no content below it

---

## Semantic Analysis (Layer 2)

The semantic layer sends the file content to Claude with a structured system prompt.
Claude returns JSON matching `Issue[]`.

```typescript
// src/analyser/semantic.ts
async function analyseSemantics(
  content: string,
  filePath: string,
  config: Config
): Promise<Issue[]>
```

**System prompt approach:**
- Send the full instruction file content as user message
- System prompt defines each semantic rule with examples
- Ask Claude to return ONLY a JSON array of `Issue` objects
- Parse and validate response with Zod before returning

Never send codebase files to the API — only the instruction file being analysed.

---

## CLI Behaviour

```bash
# Single file
npx agent-doctor CLAUDE.md

# All instruction files in project (auto-discovers)
npx agent-doctor --all

# Specific severity threshold
npx agent-doctor CLAUDE.md --fail-on critical

# Output as JSON
npx agent-doctor CLAUDE.md --format json

# Skip semantic layer (structural only, no API key needed)
npx agent-doctor CLAUDE.md --structural-only

# MCP server mode
npx agent-doctor --mcp
```

Exit codes:
- `0` — no issues at or above `--fail-on` threshold
- `1` — issues found at or above threshold
- `2` — file not found / parse error

---

## MCP Server

Expose two MCP tools:

```typescript
// Tool 1: analyse
{
  name: "analyse_agent_file",
  description: "Run agent-doctor on an instruction file and return health report",
  inputSchema: {
    filePath: string,        // path to CLAUDE.md, AGENTS.md, etc.
    layers?: ('structural' | 'semantic')[]
  }
}

// Tool 2: suggest_fix
{
  name: "suggest_fix",
  description: "Get a concrete fix suggestion for a specific issue",
  inputSchema: {
    filePath: string,
    issueRuleId: RuleId
  }
}
```

---

## Coding Standards

- TypeScript strict mode always — no `any`
- Named exports everywhere — no default exports except CLI entry
- All async functions must have try/catch with typed errors
- Never log with `console.log` in library code — use a logger interface
- Every public function needs a JSDoc comment
- Tests live in `tests/` mirroring `src/` structure
- Fixtures for test cases go in `tests/fixtures/` — good and bad examples for each rule

---

## Environment Variables

```bash
ANTHROPIC_API_KEY=         # required for semantic layer
AGENT_DOCTOR_MODEL=        # optional, default: claude-sonnet-4-6
AGENT_DOCTOR_LOG_LEVEL=    # optional: debug | info | warn | error
```

---

## Build Order (implement in this sequence)

1. `src/types.ts` — shared types first
2. `src/config.ts` — config loader
3. `src/parser/markdown.ts` — CLAUDE.md / AGENTS.md parser
4. `src/parser/mdc.ts` — .mdc parser with YAML frontmatter
5. `src/rules/structural/` — all 5 structural rules
6. `src/analyser/structural.ts` — orchestrates structural rules
7. `src/output/formatter.ts` — console output
8. `src/cli.ts` — wire up Commander.js (structural layer working end-to-end)
9. `src/analyser/semantic.ts` — Claude API integration
10. `src/output/reporter.ts` — JSON / Markdown reports
11. `src/mcp-server.ts` — MCP server
12. `tests/` — test coverage for all rules with fixtures

Ship after step 8. Steps 9–12 are v0.2.

---

## What NOT To Do

- Do not add a web UI — this is a CLI + MCP tool only
- Do not store or cache API responses
- Do not send anything other than the instruction file to the Claude API
- Do not create a `.agentdoctor/` directory in the user's project
- Do not require configuration to run — zero-config must work out of the box
- Do not use `any` type
- Do not swallow errors silently
