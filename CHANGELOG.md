# Changelog

All notable changes to `agent-doctor` are documented here.

---

## [1.5.2] — 2026-10-25

### Fixed

- **Version string in published CLI binary (second attempt)** — 1.5.1 was published with a stale `dist/cli.js` (built before `tsup.config.ts` was updated locally), so `--version` still returned `1.5.0`. This release ensures a clean `dist/` wipe before building.

---

## [1.5.1] — 2026-10-25

### Fixed

- **Version string in published CLI binary** — `tsup.config.ts` CLI entry changed from `clean: false` to `clean: true` so the output folder is always wiped before each build. Previously, a stale `dist/cli.js` from a prior build could survive the rebuild and carry the wrong `--version` value into the published package.

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
|------|----------|-----------------|
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

**`--gate` flag** — structured pass/fail for orchestrator integration.

**`--compare <ref>` flag** — side-by-side diff of two analysis results.

**Score badge** — auto-updating shields.io badge committed on every main push.

**Pre-commit hook** — blocks commits with critical structural issues.

**New file format support:** `.windsurfrules`, `.roo/rules/*.md`

---

## [0.3.1] — 2026-04-08

### Fixed
- `--fix` and `--dry-run` CLI flags not recognised
- MCP server version string corrected to `0.3.1`

---

## [0.2.2] — 2026-04-07

### Fixed
- `npx` execution: `tsup.config.ts` now injects `#!/usr/bin/env node` banner on CLI entry
- `postbuild` runs `chmod +x dist/cli.js`
- `--version` now reads from `package.json` via tsup `define` (was hardcoded `0.1.0`)

---

## [0.1.0] — 2026-04-07

### Added
- Initial release
