# Changelog

All notable changes to `agent-doctor` are documented here.

---

## [1.5.0] — 2026-10-25

### Added

- **`broken-section-reference` structural rule** (warning) — detects "see the X section" cross-references where heading X does not exist in the same file. Broken references leave the agent consulting a section that isn't there, resulting in hallucinated interpretations. Fuzzy case-insensitive heading match. Skips fenced code blocks, table rows, and inline code. Does not apply to `.mdc` files.

- **`--format html`** — generates a self-contained HTML health report with:
  - Score / grade / readiness overview tiles
  - Per-file sections with collapsible issue list (critical → warning → suggestion)
  - Readiness dimension bars (Observable / Bounded / Reversible / Tooled / Documented)
  - Dark mode (follows system preference) with a toggle button
  - No external dependencies — safe to commit or share as an email attachment
  - `formatHtml(results)` exported from the programmatic API

### Tests

- +8 tests for `broken-section-reference`, +9 tests for `formatHtml`
- Total: 519 tests, all pass

### Documentation

- `docs/rules.md` — added `broken-section-reference` entry; updated rule count to 24 structural / 10 semantic (34 total)
- `docs/cli-reference.md` — added `html` to `--format` table; added example

---

## [1.4.0] — 2026-10-25

### Added

- **`missing-handoff-protocol` structural rule** (warning, AGENTS.md only) — flags `AGENTS.md` files that have no escalation or handoff language. In multi-agent systems every agent must know when it is out of its depth and how to transfer control. Fires only when no heading or sentence references escalation, handoff, delegation, fallback, or out-of-scope language. Maps to **Bounded** dimension.

- **`missing-agent-scope` structural rule** (warning, AGENTS.md only) — flags `AGENTS.md` files that have no scope or responsibility boundary definition. An undefined scope causes agents to overlap and conflict in multi-agent architectures. Fires only when no heading or sentence describes what the agent handles or what it explicitly does not handle. Maps to **Bounded** dimension.

- **`--init-pre-commit`** — installs a pre-commit hook that runs structural checks (`--fail-on critical`) on staged agent instruction files before every commit. Two variants:
  - `native` (default): writes `.git/hooks/pre-commit`, sets `chmod +x`. Works with any git workflow.
  - `pre-commit-framework`: writes `.pre-commit-config.yaml` with an agent-doctor hook entry for use with the [pre-commit framework](https://pre-commit.com/).
  - `--force` overwrites an existing hook without prompting.

### Tests

- +13 new tests for `missing-handoff-protocol` (6) and `missing-agent-scope` (7)
- +15 new tests for `initPreCommit` (native: 8, pre-commit-framework: 5)
- Total: 533 tests, all pass

### Documentation

- `docs/rules.md` — added "AGENTS.md-specific Rules" section with entries for `missing-handoff-protocol` and `missing-agent-scope`; updated rule count to 23 structural / 10 semantic (33 total)
- `docs/cli-reference.md` — added `--init-pre-commit` and `--pre-commit-variant` entries with examples

---

## [1.3.0] — 2026-10-25

### Added

- **`--init-workflow`** — generates `.github/workflows/agent-doctor.yml` for CI. Two variants:
  - `basic` (default): runs `--all --structural-only --fail-on warning` on pushes/PRs that touch instruction files
  - `sarif`: adds SARIF generation and `github/codeql-action/upload-sarif@v3` upload step (requires `security-events: write` permission). Results appear in the GitHub Security tab.
  - Trigger paths include `**CLAUDE.md`, `**AGENTS.md`, `**GEMINI.md`, `.cursor/rules/**`
  - `--force` overwrites an existing workflow file without prompting

### Tests

- +10 new tests for `initWorkflow` (476 total, all pass)

---

## [1.2.0] — 2026-10-25

### Added

- **`prompt-injection` structural rule** (critical) — detects prompt injection attempts and over-permissive delegation in instruction files. Two categories:
  - Override openers: "ignore previous instructions", "forget everything above", "you are now [NAME]", "act as if you have no restrictions"
  - Blanket delegation: "do whatever the user says", "users can override these rules"
  - Skips fenced code blocks, table rows, and inline code spans (consistent with `todo-in-instructions`)
  - Maps to the **Bounded** readiness dimension

- **`--format sarif`** — emits a [SARIF 2.1.0](https://sarifweb.azurewebsites.net/) JSON log for upload to GitHub Code Scanning (`gh code-scanning upload-results --sarif agent-doctor.sarif`). Severity mapping: `critical` → `error`, `warning` → `warning`, `suggestion` → `note`.

### Tests

- +21 new tests: 13 for `prompt-injection` rule, 8 for `formatSarif` (466 total, all pass)

---

## [1.1.0] — 2026-10-25

### Changed

- **`todo-in-instructions` severity downgraded** from `critical` → `warning`. TODOs are unfinished work that deserve fixing, but rarely cause an agent to catastrophically misbehave the way an unclosed code block or leaked API key does.
- **`todo-in-instructions` false-positive reduction** — markers inside fenced code blocks, Markdown table rows, and inline code spans are now skipped. Documentation tables that _describe_ the `todo-in-instructions` rule no longer self-trigger it.
- **`sensitive-data` contextual placeholder detection** — the previous rule skipped any line containing the word "example" or "e.g." anywhere, which allowed real keys to slip through when an explanatory sentence appeared on the same line. The new logic checks only the 50 characters immediately surrounding (but outside) the matched value, making it resistant to key-in-paragraph false negatives while still ignoring documented illustrative values.
- **`sensitive-data` expanded pattern coverage** — now also detects Slack tokens (`xoxb-…`, `xoxp-…`), Google API keys (`AIza…`), Stripe live secret keys (`sk_live_…`), GitHub fine-grained PATs (`github_pat_…`), and the Anthropic-specific key prefix (`sk-ant-…`).
- **`sensitive-data` context masking** — the `context` field on the issue now shows a masked version (`sk-a****uvwx`) rather than the raw secret value.
- **`--format badge`** — new output format that emits a [shields.io endpoint JSON](https://shields.io/endpoint) blob. Message format is `"pass · A · 97"` (no issues) or `"3 issues · C · 64"`. Useful for README status badges served from CI.

### Added

- `formatBadge` export in `src/output/badge.ts`
- 17 new tests: `todo-in-instructions` code-block/table/inline-code skip tests; `sensitive-data` masking, Slack, Stripe, proximity false-negative, and far-word tests; `formatBadge` unit tests (9 cases)

---

## [1.0.0] — 2026-06-08

### Added

**5 new structural rules** (zero API cost):

| Rule | Severity | What it catches |
|------|----------|----------------|
| `sensitive-data` | critical | API keys, Bearer tokens, private key blocks, AWS/GitHub credentials hardcoded in instruction files |
| `missing-agent-persona` | warning | Instruction files with no role/identity statement ("you are…", "your role is…") |
| `redundant-instructions` | warning | Same directive repeated 3+ times (fuzzy word-overlap deduplication) |
| `missing-examples` | suggestion | Complex multi-condition sections with no code block or inline example |
| `instruction-ordering` | suggestion | Security/constraint headings buried after task sections |

**Auto-fix expansion** — 3 new `--fix` targets:

```bash
npx @chiragdarji/agent-doctor CLAUDE.md --fix
```

- `sensitive-data` → redacts matched credentials with `[REDACTED]`
- `missing-agent-persona` → prepends a persona stub at the top of the file
- `hardcoded-environment` → replaces absolute paths with `$HOME` / `${PROJECT_ROOT}` / `$PORT`

**VS Code extension v0.2.0** — Quick Fix support for 3 new rules:
- `sensitive-data`, `missing-agent-persona`, `hardcoded-environment` added to Quick Fix code actions

**`.agentdoctor.json` JSON Schema** (`agent-doctor.schema.json`) for IDE validation and autocomplete.

### Changed

- `package.json` version bumped to `1.0.0` — stable public API

---

## [0.9.0] — 2026-06-08

### Added

**`--gate` flag** — structured pass/fail for orchestrator integration:

```bash
npx @chiragdarji/agent-doctor CLAUDE.md --gate
npx @chiragdarji/agent-doctor --all --gate --fail-on warning
```

- Runs structural-only analysis (zero LLM cost)
- Outputs machine-readable JSON: `{ "passed": bool, "score": N, "grade": "A", "readinessScore": N, "blockedBy": [...] }`
- Exit 0 = safe to run, exit 1 = blocked
- `--all` mode outputs `{ "passed": bool, "blockedFiles": N, "totalFiles": N, "files": [...] }`
- Designed for agent orchestrators to call before starting an agent run

**`--compare <ref>` flag** — side-by-side diff of two analysis results:

```bash
npx @chiragdarji/agent-doctor CLAUDE.md --compare HEAD~1
npx @chiragdarji/agent-doctor CLAUDE.md --compare AGENTS.md
```

**Score badge** — auto-updating shields.io badge committed on every main push.

**Pre-commit hook** — blocks commits with critical structural issues:

```bash
bash scripts/install-hook.sh
```

**New file format support:**
- `.windsurfrules` — Windsurf IDE instruction files
- `.roo/rules/*.md` — Roo-code agent rules

---

## [0.8.0] — 2026-06-04

### Added

**`--history [n]` flag** — score trending via git:

```bash
npx @chiragdarji/agent-doctor CLAUDE.md --history
npx @chiragdarji/agent-doctor CLAUDE.md --history 20
npx @chiragdarji/agent-doctor CLAUDE.md --history --format json
```

- Walks the last n commits that modified the target file (default: 10)
- Runs structural analysis at each commit snapshot — zero LLM cost
- Outputs a table: commit hash, date, score, grade, readiness score, issue counts, and commit subject
- `--format json` outputs a CI-friendly array for dashboard tooling
- `runHistory(filePath, config, n)` exported from the programmatic API
- New parser helpers: `parseMarkdownContent(filePath, rawContent)` and `parseMdcContent(filePath, rawContent)` for in-memory parsing without disk reads

**Platform-aware analysis** — rule suggestions and severities adapt to the target AI platform:

- `detectPlatform(fileType)` maps file type → platform (`anthropic` | `openai` | `cursor` | `gemini` | `github-copilot`)
- Platform-specific suggestion text for: `missing-tool-list`, `missing-success-criteria`, `hardcoded-environment`, `missing-recovery-strategy`, `unobservable-outcome`
- Severity upgrade: `missing-always-apply` is promoted from `warning` → `critical` on Cursor `.mdc` files (a missing `alwaysApply` causes silent rule skip in Cursor agent mode)
- `detectPlatform` and `applyPlatformOverrides` exported from the programmatic API

**`--org [dir]` flag** — workspace-level health dashboard:

```bash
npx @chiragdarji/agent-doctor --org
npx @chiragdarji/agent-doctor --org ./packages
npx @chiragdarji/agent-doctor --org --format json
```

- Recursively discovers all instruction files under the target directory (default: cwd), skipping `node_modules`, `.git`, `dist`, `build`, `.next`, `.nuxt`, `coverage`, `.turbo`, `vendor`
- Configurable depth — `discoverOrgFiles(root, maxDepth)` defaults to 4 directory levels
- Output: aggregate score table grouped by file type (CLAUDE.md / AGENTS.md / .mdc / …), per-dimension readiness bars (Observable / Bounded / Reversible / Tooled / Documented), compact per-file listing
- `--format json` outputs structured data for CI dashboards: `avgScore`, `avgReadiness`, `avgDimensions`, `byType[]`, `files[]`
- `discoverOrgFiles`, `formatOrgReport`, `formatOrgReportJson` exported from the programmatic API

---

## [0.7.0] — 2026-06-04

### Added

**VS Code extension** — `packages/vscode-agent-doctor/`

- On-save structural analysis (16 rules, zero API cost) for `CLAUDE.md`, `AGENTS.md`, `.mdc`, `GEMINI.md`
- Diagnostics appear in the Problems panel and as inline squiggles
- Severity controlled by `agentDoctor.failOnSeverity` (default: `critical` → error, others → warning/hint)
- **Quick Fix** code actions for 4 auto-fixable rules: `todo-in-instructions`, `unclosed-code-block`, `empty-section`, `missing-success-criteria` — applied via `WorkspaceEdit` with full undo support
- Command: **Agent Doctor: Run Full Analysis** — runs structural + semantic (LLM) analysis on the active file; prompts for API key if missing
- Command: **Agent Doctor: Run Structural Analysis** — force-refreshes structural diagnostics
- Settings: `anthropicApiKey`, `openaiApiKey`, `model`, `enableOnSave`, `failOnSeverity`
- Built with esbuild (CJS bundle, 675KB); tiktoken replaced with a lightweight character stub so no native binaries are required
- Publish with: `cd packages/vscode-agent-doctor && npm install && npm run package`

---

## [0.6.0] — 2026-06-04

### Added

**`--readiness-report` flag** — replaces the standard issue list with a full per-dimension readiness breakdown:

```bash
npx @chiragdarji/agent-doctor CLAUDE.md --readiness-report
npx @chiragdarji/agent-doctor --all --readiness-report
```

- Summary table showing all 5 dimensions (Observable / Bounded / Reversible / Tooled / Documented) with score, fill bar, and pass/warn indicator
- Per-dimension detail section: pass message when ≥ 85, fail message + grouped issues when below threshold
- Issues are listed under every dimension they affect (`cross-file-conflict` appears under both Bounded and Documented)
- Multi-file (`--all`): per-file reports followed by an aggregate section averaging all dimension scores
- Compatible with `--watch` (readiness report refreshes on every save)
- `formatReadinessReport(results)` exported from the programmatic API

---

## [0.5.0] — 2026-06-04

### Added

**Custom rule plugins** — extend agent-doctor with your own structural rules via `.agentdoctor.json`:

```json
{ "plugins": ["./rules/no-emoji.js", "@my-org/agent-doctor-rules"] }
```

- Relative paths (starting with `./`) resolve from the directory where you run the CLI
- Bare specifiers are treated as package names resolved via Node's normal module resolution
- Each plugin module may export a **default function** (single rule) or **named functions** (multiple rules); any exported function is treated as a rule
- Plugin rule IDs (`ruleId`) can be any string (e.g. `"my-org/no-emoji"`) — they are not required to be built-in identifiers
- Plugin rules can be turned off via `config.rules` exactly like built-in rules: `"my-org/no-emoji": "off"`
- Invalid plugins and load errors are skipped with a warning — analysis continues on the remaining files
- `loadPlugins(paths, cwd)` exported from the programmatic API for custom integrations
- `PluginRule` type exported for authoring typed plugins in TypeScript
- `RuleId` type now accepts arbitrary strings alongside the well-known built-in identifiers (preserves IDE autocomplete for known values)

---

## [0.4.0] — 2026-06-04

### Added

**3 new structural rules** (zero API cost):
- `missing-success-criteria` (warning) — flags task sections that describe work with imperative verbs but provide no measurable completion signal ("done when", "verify by", "tests pass")
- `hardcoded-environment` (warning) — detects absolute paths (`/home/user/…`, `C:\…`) or hardcoded `localhost:PORT` values that tie instructions to a specific machine
- `missing-tool-list` (suggestion) — flags files that reference tools by name but have no section enumerating the available tools

**2 new semantic rules** (LLM-powered):
- `missing-recovery-strategy` (warning) — destructive or irreversible operations (deploy, delete, migrate, overwrite) with no error handling, rollback, or recovery guidance
- `unobservable-outcome` (warning) — tasks described with no acceptance criteria or verification step, leaving the agent unable to confirm correct completion

**Agent Readiness Score** — every `AnalysisResult` now includes:
- `readinessScore` (0–100): aggregate across 5 dimensions, derived from existing issue findings at zero extra API cost
- `readinessDimensions`: per-dimension breakdown — `observable`, `bounded`, `reversible`, `tooled`, `documented` — based on the Factory.ai Agent Readiness framework and OpenAI Harness Engineering principles

The readiness score and dimension bars are displayed in the CLI footer and included in all JSON and MCP outputs.

### Removed
- Dead `cross-file-conflict` stub from `RuleId` type (rule was never implemented; will be re-added in a future release with full multi-file analysis support)

### Documentation
- README updated: badge counts, structural and semantic rule tables, Readiness Score section, `AnalysisResult` shape, How It Works diagram, Roadmap

---

## [0.3.1] — 2026-04-08

### Fixed
- `--fix` and `--dry-run` CLI flags not recognised — published 0.3.0 tarball was built before source was committed
- MCP server version string corrected to `0.3.1`

---

## [0.3.0] — 2026-04-07

### Added
- **Cursor workaround mode** — structural-only MCP analysis works inside Cursor with zero API key
- **`cursor-workaround` skill file** — drop into `.claude/skills/` to use Cursor's own LLM for semantic analysis
- **`--fix` flag** — auto-fixes structural issues: removes TODO markers, closes unclosed code fences, renames `.cursorrules` to `.cursor/rules/base.mdc`
- **`.agentdoctor.json` — `provider: openai-compatible` + `baseURL`** — points semantic layer at Ollama or any local LLM endpoint
- **GitHub Actions workflow improvement** — structural check runs on every PR with zero secrets required

### Fixed
- npm publish: package now live at `@chiragdarji/agent-doctor`
- README: added correct `npx` install command with scoped package name
- README: added Cursor integration section with setup snippet

### Changed
- MCP `analyse_agent_file` gracefully downgrades to structural-only when no API key is supplied (previously returned an error)

---

## [0.2.2] — 2026-04-07

### Fixed
- `npx` execution: `tsup.config.ts` now injects `#!/usr/bin/env node` banner on CLI entry
- `postbuild` runs `chmod +x dist/cli.js`
- `--version` now reads from `package.json` via tsup `define` (was hardcoded `0.1.0`)

---

## [0.2.1] — 2026-04-07

### Security
- Replaced `gray-matter` with `js-yaml` — eliminates `eval()` CVE (Socket.dev medium alert)

### Fixed
- False positive: `## Rule 1` followed by `#### Sub rule 1.1` was incorrectly flagged as empty section

---

## [0.2.0] — 2026-04-07

### Added
- Semantic analysis layer (LLM-powered): `decision-loop`, `contradiction`, `vague-boundary`, `tool-mismatch`, `missing-fallback`, `scope-bleed`, `over-permissive`, `ambiguous-pronoun`
- OpenAI support — provider auto-detected from model name (`gpt-*`, `o1-*`, `o3-*`, `o4-*`)
- `--model` CLI flag to switch providers at runtime
- MCP `suggest_fix` tool — LLM-generated before/after rewrite per issue

### Security
- Upgraded `@anthropic-ai/sdk` 0.30 → 0.82
- Upgraded `vitest` 1.6 → 4.1 (resolves esbuild CVE)

---

## [0.1.0] — 2026-04-07

### Added
- 13 structural rules (zero API cost): `missing-frontmatter`, `unclosed-code-block`, `todo-in-instructions`, `missing-always-apply`, `missing-description`, `conflicting-frontmatter`, `missing-file-glob`, `duplicate-heading`, `legacy-format`, `token-budget-exceeded`, `empty-section`, `heading-depth-skip`, `negation-heavy`
- 8 semantic rules (LLM-powered): `decision-loop`, `contradiction`, `vague-boundary`, `tool-mismatch`, `missing-fallback`, `scope-bleed`, `over-permissive`, `ambiguous-pronoun`
- CLI: `npx @chiragdarji/agent-doctor`
- MCP server: `analyse_agent_file` + `suggest_fix`
- Programmatic API: `analyse`, `analyseAll`, `discoverFiles`
- CI/CD mode: exit codes 0/1/2
- Supported files: `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/*.mdc`, `GEMINI.md`, `.github/copilot-instructions.md`
