# CLI Reference

```
agent-doctor [file] [options]
```

## Arguments

| Argument | Description |
|----------|-------------|
| `file` | Path to instruction file. Optional when `--all`, `--org`, `--mcp`, or `--init` is used. |

## Options

### Analysis

| Flag | Default | Description |
|------|---------|-------------|
| `--all` | — | Discover and analyse all instruction files in the current directory tree |
| `--structural-only` | — | Skip semantic (LLM) layer; runs instantly, no API key required |
| `--model <id>` | `claude-sonnet-4-6` | Override the LLM model (e.g. `gpt-4o`, `claude-opus-4-8`) |
| `--fail-on <severity>` | `critical` | Exit code `1` threshold: `critical` \| `warning` \| `suggestion` |
| `--format <fmt>` | `text` | Output format: `text` \| `json` |

### Reporting

| Flag | Description |
|------|-------------|
| `--readiness-report` | Replace issue list with full per-dimension readiness breakdown |
| `--org [dir]` | Workspace-level health dashboard. Defaults to cwd. |
| `--history [n]` | Score trend for the last `n` commits that touched the file (default: 10) |
| `--compare <ref>` | Side-by-side diff against a git ref (e.g. `HEAD~1`) or another file path |
| `--gate` | Orchestrator gate mode — outputs machine-readable JSON pass/fail |

### Editing

| Flag | Description |
|------|-------------|
| `--fix` | Auto-fix structural issues in-place |
| `--dry-run` | Preview `--fix` output without writing files |
| `--watch` | Re-run analysis whenever the file is saved (uses `fs.watch`) |
| `--init` | Scaffold a template instruction file |
| `--type <type>` | Template type for `--init`: `claude` \| `cursor` \| `agents` |
| `--force` | Overwrite existing file with `--init` |

### Server

| Flag | Description |
|------|-------------|
| `--mcp` | Start the MCP server (for Claude Code and Cursor integration) |

### General

| Flag | Description |
|------|-------------|
| `-V, --version` | Print the installed version |
| `-h, --help` | Print help |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | No issues at or above `--fail-on` threshold (or `--gate` passed) |
| `1` | Issues found at or above threshold; also returned when called with no arguments |
| `2` | File not found, parse error, or configuration error |

---

## Examples

```bash
# Structural-only, fast, zero API cost
agent-doctor CLAUDE.md --structural-only

# Full analysis using GPT-4o
agent-doctor CLAUDE.md --model gpt-4o

# Exit 1 on any warning or above
agent-doctor CLAUDE.md --fail-on warning

# All files, JSON output for a dashboard script
agent-doctor --all --format json

# Preview auto-fixes without writing
agent-doctor CLAUDE.md --fix --dry-run

# Apply auto-fixes
agent-doctor CLAUDE.md --fix

# Compare against the previous commit
agent-doctor CLAUDE.md --compare HEAD~1

# Score history for last 20 commits
agent-doctor CLAUDE.md --history 20

# Workspace health dashboard
agent-doctor --org ./packages

# Orchestrator gate (CI pre-flight)
agent-doctor CLAUDE.md --gate

# Per-dimension readiness breakdown
agent-doctor CLAUDE.md --readiness-report

# Watch mode during editing
agent-doctor CLAUDE.md --watch

# Scaffold a new Claude Code file
agent-doctor --init --type claude

# Start MCP server
agent-doctor --mcp
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key for Claude models |
| `OPENAI_API_KEY` | API key for GPT / O-series models |
| `AGENT_DOCTOR_LOG_LEVEL` | Log verbosity: `debug` \| `info` \| `warn` \| `error` (default: `warn`) |

Provider is inferred from the model name. Only the matching key is required.
For `openai-compatible` (Ollama, LM Studio), no API key is needed.
