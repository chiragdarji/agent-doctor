# agent-doctor — AGENTS.md

You are a TypeScript/Node.js engineer maintaining `agent-doctor` — a CLI tool and MCP server that performs structural and semantic health checks on AI agent instruction files (CLAUDE.md, AGENTS.md, .cursor/rules/*.mdc, GEMINI.md, and more).

---

## Your Role

- Implement features, fix bugs, and write tests for this project
- Keep the `docs/` folder and `README.md` in sync with every code change
- Verify every change passes typecheck, tests, and lint before committing
- Never merge without updating the relevant documentation

---

## Project Summary

| Layer | Rules | Cost |
|-------|-------|------|
| Structural | 21 rules | Zero (regex/AST) |
| Semantic | 10 rules | LLM API call |

**Supported files:** `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/*.mdc`, `GEMINI.md`, `.github/copilot-instructions.md`, `.claude/agents/*.md`, `.claude/commands/*.md`, `.windsurfrules`, `.roo/rules/*.md`

---

## Key Source Files

| File | Purpose |
|------|---------|
| `src/types.ts` | All shared types — `RuleId`, `Issue`, `AnalysisResult`, `Config` |
| `src/rules/structural/` | One file per structural rule |
| `src/analyser/structural.ts` | Runs all structural rules |
| `src/analyser/semantic.ts` | LLM semantic analysis (Zod-validated) |
| `src/analyser/semantic-prompt.ts` | System prompt for semantic layer |
| `src/analyser/index.ts` | Orchestrates layers, computes scores + readiness |
| `src/fixer.ts` | `--fix` auto-repair implementations |
| `src/cli.ts` | Commander.js entry point |
| `src/mcp-server.ts` | MCP server (`analyse_agent_file`, `suggest_fix`) |
| `src/index.ts` | Programmatic API exports |

---

## Verification Checklist

Run these before every commit:

```bash
npm run typecheck    # zero errors
npm run test:run     # all tests pass
npm run lint         # zero lint errors
```

After changes that affect the CLI output or analysis logic:

```bash
npx . CLAUDE.md --structural-only   # verify this repo's own file passes
```

---

## Documentation Update Rules

**Every code change requires a documentation update in the same commit.**

| What changed | Update these files |
|-------------|-------------------|
| New structural rule | `docs/rules.md`, `README.md` (rules table + badge), `docs/contributing.md` |
| New semantic rule | `docs/rules.md`, `README.md` (rules table) |
| New CLI flag | `docs/cli-reference.md`, `README.md` CLI Reference |
| New `--fix` target | `docs/auto-fix.md`, `README.md` auto-fix table |
| New config option | `docs/configuration.md`, `agent-doctor.schema.json` |
| New export | `docs/api.md` |
| New platform/file type | `docs/platforms.md`, `README.md` Supported Files |
| Readiness deduction change | `docs/readiness-score.md` |
| MCP tool change | `docs/mcp-server.md` |
| VS Code extension change | `docs/vscode-extension.md` |
| Plugin API change | `docs/plugins.md` |
| Version bump | `README.md` badges, `CHANGELOG.md` |
| Type shape change | `docs/api.md` Core Types section |

---

## Adding a Structural Rule

1. Create `src/rules/structural/<rule-id>.ts`:

```typescript
import type { Issue, StructuralRule } from '../../types.js';

export const myRule: StructuralRule = (content, filePath) => {
  const issues: Issue[] = [];
  // detection logic
  return issues;
};
```

2. Export from `src/rules/structural/index.ts`
3. Add to the rules array in `src/analyser/structural.ts`
4. Add `RuleId` to `KnownRuleId` in `src/types.ts`
5. Add readiness deductions in `src/analyser/index.ts`
6. Add tests in `tests/structural.test.ts` (≥3 positive, ≥3 negative cases)
7. **Update `docs/rules.md`** with rule entry, severity, and Bad/Good examples
8. **Update `README.md`** structural rules table and badge count

---

## Adding a Semantic Rule

1. Add rule description + example to `SEMANTIC_SYSTEM_PROMPT` in `src/analyser/semantic-prompt.ts`
2. Add `ruleId` to the Zod enum in `src/analyser/semantic.ts`
3. Add `RuleId` to `KnownRuleId` in `src/types.ts`
4. Add readiness deductions in `src/analyser/index.ts`
5. Write tests in `tests/semantic.test.ts` using injected mock `LLMClient`
6. **Update `docs/rules.md`** semantic rules section
7. **Update `README.md`** semantic rules table

---

## Adding a --fix Target

1. Add the `ruleId` to `AUTO_FIXABLE` set in `src/fixer.ts`
2. Implement the fix in the `switch` statement inside `applyFixes()`
3. Add the same `ruleId` to `AUTO_FIXABLE` in `packages/vscode-agent-doctor/src/code-actions.ts`
4. Write tests in `tests/fixer.test.ts`
5. **Update `docs/auto-fix.md`** with the fix action and before/after example
6. **Update `README.md`** auto-fix table

---

## Coding Standards

- TypeScript strict mode — no `any`
- Named exports everywhere — no default exports except `src/cli.ts`
- No `console.log` in library code — use `logger.info()` / `logger.warn()` / `logger.error()`
- All async functions have try/catch with typed errors
- No `gray-matter` — use `js-yaml` safe `load()` directly
- No comments unless the WHY is non-obvious

---

## Environment Variables

```bash
ANTHROPIC_API_KEY=         # Claude models
OPENAI_API_KEY=            # GPT / O-series models
AGENT_DOCTOR_LOG_LEVEL=    # debug | info | warn | error (default: warn)
```

---

## What NOT To Do

- Do not add a web UI
- Do not cache or store API responses
- Do not send anything other than the instruction file to the LLM
- Do not use `any` type
- Do not swallow errors silently
- Do not merge code changes without updating the relevant `docs/` file(s)
- Do not use `gray-matter`
