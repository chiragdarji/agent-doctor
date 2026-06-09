# MCP Server

agent-doctor exposes an MCP (Model Context Protocol) server so you can run analysis directly from inside Claude Code and Cursor without leaving the editor.

## Starting the Server

```bash
npx @chiragdarji/agent-doctor --mcp
```

## Setup

### Claude Code

Add to `.claude/settings.json` (project) or `~/.claude/settings.json` (global):

```json
{
  "mcpServers": {
    "agent-doctor": {
      "command": "npx",
      "args": ["@chiragdarji/agent-doctor", "--mcp"]
    }
  }
}
```

See `examples/claude-settings.json` in the repo for a ready-to-copy snippet.

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "agent-doctor": {
      "command": "npx",
      "args": ["@chiragdarji/agent-doctor", "--mcp"]
    }
  }
}
```

See `examples/cursor-mcp.json` for a ready-to-copy snippet.

---

## Tools

### `analyse_agent_file`

Run structural + semantic analysis on one or more instruction files.

**Input schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `filePath` | `string` | See note | Single file path. Mutually exclusive with `filePaths`. |
| `filePaths` | `string[]` | See note | Multiple files. Enables cross-file conflict detection. |
| `layers` | `string[]` | No | `["structural"]`, `["semantic"]`, or `["structural", "semantic"]` (default) |
| `model` | `string` | No | Override LLM model. Default: from config. |
| `anthropicApiKey` | `string` | No | Anthropic API key. Falls back to `ANTHROPIC_API_KEY` env var. |
| `openaiApiKey` | `string` | No | OpenAI API key. Falls back to `OPENAI_API_KEY` env var. |

Provide either `filePath` or `filePaths`, not both.

**Graceful downgrade:** if semantic analysis is requested but no API key is available, the server automatically falls back to structural-only analysis.

**Example call (from Claude Code):**

```
Use the analyse_agent_file tool with filePath: "CLAUDE.md"
```

**Returns:** Markdown report with:
- Health score and grade
- Readiness score and dimension bars
- All issues grouped by severity
- Cross-file conflicts (when multiple files provided)

---

### `suggest_fix`

Get a targeted fix suggestion for a specific rule violation. When an API key is available, returns an LLM-generated before/after rewrite.

**Input schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `filePath` | `string` | Yes | Path to the instruction file |
| `issueRuleId` | `string` | Yes | The `ruleId` of the issue to fix |
| `model` | `string` | No | Override LLM model |
| `anthropicApiKey` | `string` | No | Anthropic API key |
| `openaiApiKey` | `string` | No | OpenAI API key |

**Example call:**

```
Use the suggest_fix tool with filePath: "CLAUDE.md" and issueRuleId: "missing-recovery-strategy"
```

**Returns:** 
- The built-in suggestion text for the rule
- (If API key available) LLM-generated rewrite showing the problematic section before and after the fix

---

## Without an API Key (Cursor Workaround)

If you are using Cursor and do not want to supply an API key, the `cursor-semantic-analysis` skill in `skills/cursor-semantic-analysis/SKILL.md` lets you use Cursor's own LLM for semantic-style analysis while agent-doctor handles structural checks via MCP.

Drop the skill file into `.claude/skills/` or follow the setup instructions in the file.

---

## Programmatic MCP Access

The MCP server is started with:

```typescript
import { startMcpServer } from '@chiragdarji/agent-doctor/mcp-server';
await startMcpServer();
```

The server reads `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` from the environment. API keys can also be passed per-request via tool inputs.
