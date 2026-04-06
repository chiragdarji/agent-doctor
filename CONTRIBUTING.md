# Contributing to agent-doctor

Thanks for wanting to contribute. This is an early alpha — your input shapes what this becomes.

## What's Most Useful Right Now

### 1. Real-world failure cases
Open an issue with:
- The instruction that caused your agent to behave unexpectedly
- What you expected vs what happened
- The file type (CLAUDE.md / AGENTS.md / .mdc)

These become test fixtures and new semantic rules.

### 2. False positive reports
If `agent-doctor` flagged something that was actually correct, open an issue.
False positives erode trust. We want to know immediately.

### 3. Rule pack contributions
Framework-specific rules for LangGraph, CrewAI, AutoGen, etc.
See `src/rules/` for the pattern to follow.

---

## Dev Setup

```bash
git clone https://github.com/chiragdarji/agent-doctor
cd agent-doctor
npm install
npm run dev
```

Requirements: Node.js 20+, an `ANTHROPIC_API_KEY` for semantic tests.

---

## Pull Request Process

1. Fork the repo and create a branch: `git checkout -b feat/your-feature`
2. Make your changes
3. Run `npm run typecheck && npm run lint && npm run test:run`
4. All three must pass before opening a PR
5. Write a clear description of what the PR does and why

## Commit Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add cross-file-conflict semantic rule
fix: false positive on tool-mismatch for read-only tools
docs: add LangGraph rule pack example
test: add fixture for decision-loop edge case
```

## Code Standards

- TypeScript strict — no `any`, no `// @ts-ignore`
- Named exports only
- Every new rule needs a test fixture (both good and bad example)
- Every new rule needs a JSDoc comment explaining what it detects

## Adding a New Structural Rule

1. Create `src/rules/structural/<rule-id>.ts`
2. Export a function matching `StructuralRule` type from `src/types.ts`
3. Register it in `src/analyser/structural.ts`
4. Add fixtures in `tests/fixtures/`
5. Add tests in `tests/structural.test.ts`

## Adding a New Semantic Rule

1. Add the `RuleId` to `src/types.ts`
2. Add a description + example to the semantic system prompt in `src/analyser/semantic.ts`
3. Add fixtures in `tests/fixtures/`
4. Add tests in `tests/semantic.test.ts`

---

## Questions

Open a GitHub Discussion or an issue tagged `question`.
