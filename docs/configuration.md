# Configuration

agent-doctor runs zero-config out of the box. Place `.agentdoctor.json` at the project root to customise behaviour.

## .agentdoctor.json

```json
{
  "$schema": "./agent-doctor.schema.json",
  "model": "claude-sonnet-4-6",
  "provider": "anthropic",
  "layers": ["structural", "semantic"],
  "rules": {
    "negation-heavy": "off",
    "heading-depth-skip": "off"
  },
  "tokenBudgetWarning": 500,
  "ignore": [".claude/agents/legacy-*.md"],
  "failOn": "critical",
  "plugins": ["./rules/my-custom.js"]
}
```

Add `"$schema": "./agent-doctor.schema.json"` (included in the package) for IDE autocomplete and validation.

---

## All Options

### `model`

**Type:** `string`  
**Default:** `"claude-sonnet-4-6"`

The LLM model for semantic analysis. Provider is inferred from the model name:

| Model prefix | Provider |
|--------------|----------|
| `gpt-*`, `o1-*`, `o3-*`, `o4-*` | OpenAI |
| Everything else | Anthropic |

Examples: `"claude-opus-4-8"`, `"gpt-4o"`, `"claude-haiku-4-5-20251001"`

---

### `provider`

**Type:** `"anthropic" | "openai" | "openai-compatible"`  
**Default:** inferred from model name

Override the provider explicitly. Use `"openai-compatible"` for Ollama, LM Studio, vLLM, and other local LLMs.

---

### `baseURL`

**Type:** `string`

Required when `provider` is `"openai-compatible"`. Points at the local LLM endpoint.

```json
{
  "provider": "openai-compatible",
  "baseURL": "http://localhost:11434/v1",
  "model": "llama3"
}
```

---

### `layers`

**Type:** `Array<"structural" | "semantic">`  
**Default:** `["structural", "semantic"]`

Which analysis layers to run. Omit `"semantic"` to skip the LLM entirely (equivalent to `--structural-only`).

```json
{ "layers": ["structural"] }
```

---

### `rules`

**Type:** `Record<RuleId, "critical" | "warning" | "suggestion" | "off">`  
**Default:** `{}`

Override the severity of any rule or disable it entirely.

```json
{
  "rules": {
    "negation-heavy": "off",
    "heading-depth-skip": "warning",
    "missing-always-apply": "critical",
    "todo-in-instructions": "warning"
  }
}
```

See [Rules Reference](./rules.md) for all rule IDs.

---

### `tokenBudgetWarning`

**Type:** `number`  
**Default:** `500`

Tokens per section before `token-budget-exceeded` fires. Set to `0` to disable the rule entirely, or increase for large documentation-style files.

---

### `ignore`

**Type:** `string[]`  
**Default:** `[]`

Glob patterns for files to skip during `--all` and `--org` discovery. Patterns are matched against absolute paths.

```json
{
  "ignore": [
    ".claude/agents/legacy-*.md",
    "packages/deprecated/**"
  ]
}
```

---

### `failOn`

**Type:** `"critical" | "warning" | "suggestion"`  
**Default:** `"critical"`

The minimum severity that produces exit code `1`. Useful for stricter CI pipelines:

```json
{ "failOn": "warning" }
```

---

### `plugins`

**Type:** `string[]`  
**Default:** `[]`

Paths to custom rule modules. Relative paths are resolved from the directory where you run the CLI.

```json
{
  "plugins": [
    "./rules/no-emoji.js",
    "@my-org/agent-doctor-rules"
  ]
}
```

See [Custom Plugins](./plugins.md) for authoring instructions.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key for Claude models (required for Anthropic semantic analysis) |
| `OPENAI_API_KEY` | API key for GPT / O-series models (required for OpenAI semantic analysis) |
| `AGENT_DOCTOR_LOG_LEVEL` | Log verbosity: `debug` \| `info` \| `warn` \| `error` (default: `warn`) |

API keys supplied via CLI flags (`--anthropicApiKey`, available in MCP tool inputs) take precedence over environment variables.

For `openai-compatible` providers (Ollama, etc.), `OPENAI_API_KEY` is not required — the SDK falls back to `"ollama"` which local endpoints ignore.

---

## Config Loading

`.agentdoctor.json` is loaded from the current working directory. Missing fields fall back to defaults. An invalid JSON file produces exit code `2`.

```typescript
import { loadConfig } from '@chiragdarji/agent-doctor';
const config = loadConfig('/path/to/project');
```

---

## Per-Project vs Global

There is no global config file — `.agentdoctor.json` is always project-local. If you want consistent defaults across multiple projects, create a shared npm package with your rule overrides and load it via `plugins`.

---

## Ollama / Local LLM Example

```json
{
  "$schema": "./agent-doctor.schema.json",
  "provider": "openai-compatible",
  "baseURL": "http://localhost:11434/v1",
  "model": "llama3",
  "layers": ["structural", "semantic"]
}
```

No API key required.
