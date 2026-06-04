# agent-doctor — Development Task List

Each task is scoped to a single commit. Check the box and push when done.

---

## Phase 1 — Documentation & Cleanup

> Goal: make the codebase and docs match reality. No new features, just trust repair.

- [x] **1.1** Fix README badge counts — update "13 structural / 8 semantic" → "16 structural / 10 semantic"
- [x] **1.2** Update README structural rules table — add `missing-success-criteria`, `hardcoded-environment`, `missing-tool-list` rows
- [x] **1.3** Update README semantic rules table — add `missing-recovery-strategy`, `unobservable-outcome` rows
- [x] **1.4** Add Readiness Score section to README — explain the 5 dimensions (observable / bounded / reversible / tooled / documented) and show example CLI output
- [x] **1.5** Add explicit semantic test cases to `tests/semantic.test.ts` — one positive + one negative example each for `missing-recovery-strategy` and `unobservable-outcome` using injected mock `LLMClient`
- [x] **1.6** Remove dead `cross-file-conflict` stub from `RuleId` in `src/types.ts` (it is unimplemented; will be re-added properly in Phase 2)
- [x] **1.7** Add CHANGELOG entry — document all rule additions since v0.1.0 and bump version to **v0.4.0** in `package.json`

---

## Phase 2 — Core Features

> Goal: features that directly improve the write-test-fix loop for agent authors.

### 2A — `--watch` mode
- [x] **2A.1** Add `--watch` flag to CLI (`src/cli.ts`) — use `fs.watch` to re-run analysis on file change; print a clear "File changed, re-analysing…" header between runs
- [x] **2A.2** Add tests for watch mode in `tests/cli-watch.test.ts` (re-analysis picks up changes, readiness updates)

### 2B — Auto-fix for `missing-success-criteria`
- [x] **2B.1** Implement fix in `src/fixer.ts` — append `> ✅ Success criteria: done when <describe expected outcome>` blockquote at end of section
- [x] **2B.2** Add tests to `tests/fixer.test.ts` — dry-run preview + actual write for `missing-success-criteria`

### 2C — `--init` scaffold generator
- [x] **2C.1** Implement `--init` flag in CLI — writes a well-structured `CLAUDE.md` template to CWD that scores A out of the box on all 16 structural rules
- [x] **2C.2** Implement `--init --type cursor` — writes `.cursor/rules/main.mdc` with correct frontmatter (`alwaysApply: true`, `description`, no `globs` conflict)
- [x] **2C.3** Implement `--init --type agents` — writes `AGENTS.md` template for OpenAI agents
- [x] **2C.4** Guard against overwriting existing files — prompt user (or use `--force` to skip prompt)
- [x] **2C.5** Add tests in `tests/init.test.ts` — verify each template type produces zero structural issues when run through `runStructuralAnalysis`

### 2D — `cross-file-conflict` semantic rule
- [x] **2D.1** Re-add `cross-file-conflict` to `RuleId` in `src/types.ts` and `SEMANTIC_RULE_IDS` in `src/analyser/semantic.ts`
- [x] **2D.2** Create `src/analyser/multi-file-semantic.ts` — sends 2+ file contents together to the LLM with a new system prompt focused on cross-file conflicts
- [x] **2D.3** Add cross-file prompt to `src/analyser/semantic-prompt.ts` — define the `cross-file-conflict` rule with BAD/GOOD examples
- [x] **2D.4** Wire into CLI: `--all` flag already discovers multiple files — feed them to `multiFileSemantics()` after individual analysis
- [x] **2D.5** Wire into MCP server: `analyse_agent_file` with `layers: ["semantic"]` on multiple files triggers cross-file check
- [x] **2D.6** Add tests in `tests/multi-file-semantic.test.ts` — injected mock client, conflict detected and none detected cases

### 2E — GitHub Actions native action
- [x] **2E.1** Create `action.yml` in repo root — defines `inputs` (files, fail-on, model, anthropic-api-key, openai-api-key) and `outputs` (score, grade, issues-count)
- [x] **2E.2** Create `action-runner.js` (node20 entrypoint) that calls `dist/cli.js` and sets GITHUB_OUTPUT variables
- [x] **2E.3** Update README GitHub Actions section to show the `uses: chiragdarji/agent-doctor@v1` syntax

---

## Phase 3 — Ecosystem

> Goal: extend reach — integrate agent-doctor into more surfaces.

### 3A — Custom rule plugins
- [x] **3A.1** Define plugin interface in `src/types.ts` — `PluginRule = StructuralRule` alias; `plugins: string[]` added to `Config` and `DEFAULT_CONFIG`
- [x] **3A.2** Update `src/config.ts` — `plugins` key parsed automatically via spread merge in `loadConfig`; `src/plugin-loader.ts` created for dynamic imports
- [x] **3A.3** Update `src/analyser/structural.ts` — accepts `pluginRules: PluginRule[]`; `src/analyser/index.ts` calls `loadPlugins()` once per `analyse`/`analyseAll`
- [x] **3A.4** Add tests in `tests/plugin-loader.test.ts` — fixture plugins in `tests/fixtures/plugins/`; 13 tests covering load, fire, turn-off, skip-invalid
- [x] **3A.5** Document plugin authoring in README — "Custom Rule Plugins" section with JS example, named exports, TypeScript typing

### 3B — `--readiness-report` command
- [ ] **3B.1** Add `--readiness-report` flag to CLI — outputs a full human-readable breakdown of the 5 readiness dimensions with per-dimension guidance
- [ ] **3B.2** Create `src/output/readiness-reporter.ts` — formats `ReadinessDimensions` into actionable advice sections (e.g. "Observable: 60/100 — Add success criteria to 2 task sections")
- [ ] **3B.3** Add tests in `tests/readiness-reporter.test.ts`

### 3C — VS Code extension
- [ ] **3C.1** Create `packages/vscode-agent-doctor/` subdirectory with `package.json` for VS Code extension
- [ ] **3C.2** Implement `extension.ts` — on-save diagnostic provider that runs structural rules (zero API cost) against active `.md` / `.mdc` files
- [ ] **3C.3** Implement inline code actions — "Apply fix" for auto-fixable rules
- [ ] **3C.4** Add semantic analysis on-demand via command palette ("agent-doctor: Run full analysis")
- [ ] **3C.5** Publish to VS Code Marketplace

---

## Phase 4 — Intelligence

> Goal: make agent-doctor smarter over time.

### 4A — Score trending via git
- [ ] **4A.1** Implement `--history [n]` flag — walks last n git commits, runs structural analysis at each, outputs score trend table
- [ ] **4A.2** Add `--history --format json` for CI integration
- [ ] **4A.3** Add tests using a fixture git repo

### 4B — Model-aware analysis
- [ ] **4B.1** Detect which AI platform the file targets from filename/content (CLAUDE.md → Anthropic, AGENTS.md → OpenAI, .mdc → Cursor)
- [ ] **4B.2** Adjust rule sensitivities and suggestions based on target platform (e.g. `alwaysApply` frontmatter is Cursor-specific, not relevant for CLAUDE.md)
- [ ] **4B.3** Add platform-specific suggestions to issue messages where applicable

### 4C — Org-level health dashboard
- [ ] **4C.1** Implement `--org` flag — discovers all instruction files across a local monorepo or multi-repo workspace
- [ ] **4C.2** Output aggregate readiness scores by file type and dimension
- [ ] **4C.3** Add `--format json` output for dashboard tooling

---

## Commit convention

Each completed task → one commit on `claude/agent-readiness-integration-18Evr` with message:

```
<type>(<task-id>): <description>

e.g.
docs(1.1): fix README badge counts to 16 structural / 10 semantic
feat(2C.1): add --init flag with CLAUDE.md scaffold template
test(2B.2): add fixer tests for missing-success-criteria auto-fix
```

Types: `docs` · `feat` · `fix` · `test` · `refactor` · `chore`

---

_Last updated: 2026-06-04 — Phase 1 complete, Phase 2 complete, Phase 3A complete_
