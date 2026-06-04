# Changelog

All notable changes to `agent-doctor` are documented here.

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
