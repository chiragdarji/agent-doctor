# Contributing

## Development Setup

```bash
git clone https://github.com/chiragdarji/agent-doctor.git
cd agent-doctor
npm install
npm run dev        # tsx watch — rebuilds on save
```

## Commands

```bash
npm run build        # tsup → dist/
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
│   ├── cli.ts                  # Commander.js entry (shebang injected by tsup)
│   ├── index.ts                # Programmatic API exports
│   ├── fixer.ts                # --fix: applyFixes() per rule
│   ├── init.ts                 # --init: template scaffolding
│   ├── mcp-server.ts           # MCP server (analyse_agent_file + suggest_fix)
│   ├── plugin-loader.ts        # Dynamic plugin imports
│   ├── discovery.ts            # Auto-discovers instruction files
│   ├── config.ts               # .agentdoctor.json loader
│   ├── tokens.ts               # tiktoken wrapper
│   ├── logger.ts               # Structured logger (stderr)
│   ├── types.ts                # All shared TypeScript types
│   ├── analyser/
│   │   ├── index.ts            # Orchestrates structural + semantic layers
│   │   ├── structural.ts       # Runs all structural rules
│   │   ├── semantic.ts         # LLM semantic analysis (Zod-validated)
│   │   ├── semantic-prompt.ts  # System prompt for semantic analysis
│   │   ├── llm-client.ts       # LLMClient interface + provider adapters
│   │   ├── platform.ts         # Platform detection + overrides
│   │   ├── history.ts          # Git history score trending
│   │   └── multi-file-semantic.ts  # Cross-file conflict detection
│   ├── parser/
│   │   ├── index.ts            # Routes to correct parser by file type
│   │   ├── markdown.ts         # CLAUDE.md / AGENTS.md parser
│   │   ├── mdc.ts              # .cursor/rules/*.mdc parser
│   │   └── sections.ts         # Splits content into Section[] by heading
│   ├── rules/
│   │   └── structural/         # One file per structural rule
│   │       └── index.ts        # Re-exports all rules
│   └── output/
│       ├── formatter.ts        # Console + JSON output
│       ├── readiness-reporter.ts
│       ├── history-reporter.ts
│       ├── org-reporter.ts
│       ├── gate-reporter.ts
│       └── compare-reporter.ts
├── tests/
│   ├── fixtures/               # Sample files for structural rule tests
│   └── *.test.ts               # Test files mirroring src/ structure
├── packages/
│   └── vscode-agent-doctor/    # VS Code extension
│       ├── src/
│       │   ├── extension.ts
│       │   ├── diagnostics.ts
│       │   └── code-actions.ts
│       ├── esbuild.mjs
│       └── package.json
├── examples/
├── skills/
├── scripts/
│   └── release.sh
├── agent-doctor.schema.json    # JSON Schema for .agentdoctor.json
├── tsup.config.ts
└── vitest.config.ts
```

---

## Architecture

### Analysis Pipeline

```
CLI / MCP / API call
        ↓
  loadConfig()
        ↓
  parseFile(filePath)   ← js-yaml frontmatter, parseSections(), countTokens()
        ↓
  runStructuralAnalysis(parsed, config, plugins)
        ↓
  analyseSemantics(content, filePath, config)  ← optional, needs API key
        ↓
  computeReadiness(issues)
        ↓
  calculateScore(issues) + calculateGrade(score)
        ↓
  AnalysisResult
```

### Adding a Structural Rule

1. Create `src/rules/structural/my-rule.ts`:

```typescript
import type { Issue, StructuralRule } from '../../types.js';

export const myRule: StructuralRule = (content, filePath) => {
  const issues: Issue[] = [];
  // ... detection logic
  return issues;
};
```

2. Export from `src/rules/structural/index.ts`:

```typescript
export { myRule } from './my-rule.js';
```

3. Add to the rules array in `src/analyser/structural.ts`:

```typescript
import { myRule } from '../rules/structural/index.js';
// ...
const rules: StructuralRule[] = [
  // existing rules...
  myRule,
];
```

4. Add the `RuleId` to `src/types.ts`:

```typescript
type KnownRuleId =
  // ...
  | 'my-rule';
```

5. Add readiness deductions in `src/analyser/index.ts`:

```typescript
const READINESS_DEDUCTIONS: Record<string, Partial<ReadinessDimensions>> = {
  // ...
  'my-rule': { documented: 10 },
};
```

6. Write tests in `tests/structural.test.ts`.

### Adding a Semantic Rule

1. Add the rule description and example to `SEMANTIC_SYSTEM_PROMPT` in `src/analyser/semantic-prompt.ts`.

2. Add the `ruleId` to the Zod schema in `src/analyser/semantic.ts`:

```typescript
const RuleIdSchema = z.enum([
  // existing...
  'my-semantic-rule',
]);
```

3. Add the `RuleId` to `src/types.ts`.

4. Add readiness deductions in `src/analyser/index.ts`.

5. Write tests in `tests/semantic.test.ts` using the injectable `LLMClient`.

---

## Coding Standards

- **TypeScript strict mode** — no `any`
- **Named exports everywhere** — no default exports except CLI entry (`src/cli.ts`)
- **No `console.log`** in library code — use `logger.info()` / `logger.warn()` / `logger.error()`
- **Try/catch with typed errors** on all async functions
- **No `gray-matter`** — use `js-yaml` safe `load()` directly (gray-matter uses `eval()`)
- **No comments** unless the WHY is non-obvious
- **Tests in `tests/`** mirroring `src/` structure
- **Fixtures** for test cases in `tests/fixtures/`

---

## Testing

```bash
npm run test:run
```

258 tests across 17 test files. All tests must pass before merging.

### Writing Tests

Use vitest with the `forks` pool (required for tiktoken WASM):

```typescript
// tests/structural.test.ts
import { describe, it, expect } from 'vitest';
import { myRule } from '../src/rules/structural/my-rule.js';

describe('my-rule', () => {
  it('flags the bad case', () => {
    const issues = myRule(badContent, 'CLAUDE.md');
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('my-rule');
    expect(issues[0].severity).toBe('warning');
  });

  it('does not flag the good case', () => {
    const issues = myRule(goodContent, 'CLAUDE.md');
    expect(issues).toHaveLength(0);
  });
});
```

### Testing Semantic Rules

Inject a mock `LLMClient` to avoid real API calls:

```typescript
import { analyseSemantics } from '../src/analyser/semantic.js';
import type { LLMClient } from '../src/types.js';

const mockClient: LLMClient = {
  async complete() {
    return {
      text: JSON.stringify([{
        ruleId: 'contradiction',
        severity: 'critical',
        message: '...',
        suggestion: '...',
      }]),
    };
  },
};

const issues = await analyseSemantics(content, 'CLAUDE.md', config, mockClient);
```

---

## Build

### CLI + Library

```bash
npm run build
```

Produces:
- `dist/cli.js` — executable with `#!/usr/bin/env node` shebang
- `dist/index.js` — library entry (no shebang)
- `dist/mcp-server.js` — MCP server entry
- `dist/*.d.ts` — TypeScript declarations

Version is injected at build time via tsup `define`:

```typescript
// tsup.config.ts
define: { __CLI_VERSION__: JSON.stringify(pkg.version) }
```

### VS Code Extension

```bash
cd packages/vscode-agent-doctor
npm install
npm run build     # esbuild → dist/extension.js (CJS, ~675KB)
npm run package   # vsce → vscode-agent-doctor-x.x.x.vsix
```

---

## Release Checklist

```bash
bash scripts/release.sh
```

Manual steps:
1. Bump `version` in `package.json`
2. Update `CHANGELOG.md`
3. `npm run build && npm run test:run && npm run typecheck`
4. `git tag vX.Y.Z && git push origin vX.Y.Z`
5. `npm publish --access public`
6. Create GitHub release with tag `vX.Y.Z`
7. For VS Code: bump `packages/vscode-agent-doctor/package.json`, rebuild, `npm run package`, upload `.vsix` to Marketplace
