# Changelog

All notable changes to `agent-doctor` are documented here.

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
