# Programmatic API

agent-doctor exports a full TypeScript API for integration into other tools, CI scripts, and custom analysis pipelines.

```bash
npm install @chiragdarji/agent-doctor
```

All exports are ES modules (`"type": "module"`). Node.js 20+ is required.

---

## Core Analysis

### `analyse(filePath, config)`

Analyse a single instruction file.

```typescript
import { analyse, loadConfig } from '@chiragdarji/agent-doctor';

const config = loadConfig();
const result = await analyse('CLAUDE.md', config);

console.log(result.score);           // 0–100
console.log(result.grade);           // 'A' | 'B' | 'C' | 'D' | 'F'
console.log(result.readinessScore);  // 0–100
console.log(result.issues);          // Issue[]
```

### `analyseAll(filePaths, config)`

Analyse multiple files. Plugins are loaded once and reused.

```typescript
import { analyseAll, discoverFiles, loadConfig } from '@chiragdarji/agent-doctor';

const config = loadConfig();
const files = discoverFiles(process.cwd());
const results = await analyseAll(files, config);
```

### `analyseCrossFile(files, config, client?)`

Detect cross-file conflicts. Returns `null` if fewer than two files are provided or no semantic layer is configured.

```typescript
import { analyseCrossFile, loadConfig } from '@chiragdarji/agent-doctor';

const files = [
  { filePath: 'CLAUDE.md', content: '...' },
  { filePath: 'AGENTS.md', content: '...' },
];
const result = await analyseCrossFile(files, loadConfig());
if (result) {
  console.log(result.issues);  // cross-file-conflict issues only
}
```

---

## Discovery

### `discoverFiles(cwd)`

Find all instruction files in a single directory.

```typescript
import { discoverFiles } from '@chiragdarji/agent-doctor';
const files = discoverFiles('/path/to/project');
// ['CLAUDE.md', '.cursor/rules/main.mdc', ...]
```

### `discoverOrgFiles(root, maxDepth?)`

Recursively discover instruction files across a monorepo. Default `maxDepth` is 4. Skips `node_modules`, `.git`, `dist`, `build`, `.next`, `.nuxt`, `coverage`, `.turbo`, `vendor`.

```typescript
import { discoverOrgFiles } from '@chiragdarji/agent-doctor';
const files = discoverOrgFiles('/path/to/monorepo', 4);
```

---

## Config

### `loadConfig(cwd?)`

Load and merge `.agentdoctor.json` with defaults.

```typescript
import { loadConfig } from '@chiragdarji/agent-doctor';
const config = loadConfig('/path/to/project');
```

Returns `DEFAULT_CONFIG` if no `.agentdoctor.json` is found.

---

## Parser

### `parseFile(filePath)`

Parse an instruction file from disk. Routes to the correct parser based on extension and filename.

```typescript
import { parseFile } from '@chiragdarji/agent-doctor';
const parsed = parseFile('CLAUDE.md');
// parsed.sections, parsed.frontmatter, parsed.tokenCount, ...
```

### `parseMarkdownContent(filePath, rawContent)`

Parse markdown from an in-memory string. Used by `--compare` for git history analysis.

```typescript
import { parseMarkdownContent } from '@chiragdarji/agent-doctor';
const parsed = parseMarkdownContent('CLAUDE.md', markdownString);
```

### `parseMdcContent(filePath, rawContent)`

Parse a Cursor `.mdc` file from an in-memory string.

### `parseSections(content)`

Split markdown content into `Section[]` by heading.

```typescript
import { parseSections } from '@chiragdarji/agent-doctor';
const sections = parseSections(markdownContent);
// [{ heading: 'Tools', level: 2, content: '...', line: 5, tokenCount: 42 }]
```

---

## Structural Analysis

### `runStructuralAnalysis(parsed, config, pluginRules?)`

Run all structural rules against a parsed file.

```typescript
import { parseFile, runStructuralAnalysis, loadConfig } from '@chiragdarji/agent-doctor';

const parsed = parseFile('CLAUDE.md');
const config = loadConfig();
const issues = runStructuralAnalysis(parsed, config);
```

---

## Semantic Analysis

### `analyseSemantics(content, filePath, config, client?)`

Run semantic (LLM) analysis. Returns `[]` if no API key is configured.

```typescript
import { analyseSemantics, createAnthropicClient, loadConfig } from '@chiragdarji/agent-doctor';

const client = createAnthropicClient(process.env.ANTHROPIC_API_KEY!);
const issues = await analyseSemantics(content, 'CLAUDE.md', loadConfig(), client);
```

The optional `client` parameter is useful for injecting mocks in tests.

---

## LLM Clients

### `createAnthropicClient(apiKey)`

Create an Anthropic LLM client.

```typescript
import { createAnthropicClient } from '@chiragdarji/agent-doctor';
const client = createAnthropicClient(process.env.ANTHROPIC_API_KEY!);
```

### `createOpenAIClient(apiKey)`

Create an OpenAI LLM client.

### `createOpenAICompatibleClient(baseURL, apiKey?)`

Create a client for Ollama, LM Studio, vLLM, or any OpenAI-compatible endpoint.

```typescript
import { createOpenAICompatibleClient } from '@chiragdarji/agent-doctor';
const client = createOpenAICompatibleClient('http://localhost:11434/v1');
```

### `createClientFromConfig(config)`

Resolve the correct client from a `Config` object. Returns `null` if no API key is available.

### `inferProvider(model)` / `resolveProvider(config)`

```typescript
import { inferProvider } from '@chiragdarji/agent-doctor';
inferProvider('gpt-4o');               // 'openai'
inferProvider('claude-sonnet-4-6');    // 'anthropic'
```

---

## Fixer

### `applyFixes(filePath, issues, options?)`

Apply auto-fixes to a file.

```typescript
import { applyFixes } from '@chiragdarji/agent-doctor';

const result = await applyFixes('CLAUDE.md', issues);
// result.fixed   — RuleId[] of applied fixes
// result.skipped — RuleId[] with no auto-fix

// Dry run
const preview = await applyFixes('CLAUDE.md', issues, { dryRun: true });
console.log(preview.preview);
```

---

## Init

### `initFile(opts)`

Scaffold a new instruction file from a built-in template.

```typescript
import { initFile } from '@chiragdarji/agent-doctor';

const result = await initFile({ type: 'claude', cwd: process.cwd() });
// result.filePath — created file path
// result.skipped  — true if file existed and force was false
```

### `templateFor(type)`

Get the template string without writing it to disk.

```typescript
import { templateFor } from '@chiragdarji/agent-doctor';
const template = templateFor('claude');
```

---

## Platform Detection

### `detectPlatform(fileType)` / `applyPlatformOverrides(issues, platform)`

```typescript
import { detectPlatform, applyPlatformOverrides } from '@chiragdarji/agent-doctor';

const platform = detectPlatform('cursor-mdc');   // 'cursor'
const adjusted = applyPlatformOverrides(issues, platform);
// Promotes missing-always-apply to 'critical' on Cursor
```

---

## History

### `runHistory(filePath, config, n?)`

Score trending via git. Returns the last `n` commits (default: 10) that modified the file.

```typescript
import { runHistory, loadConfig } from '@chiragdarji/agent-doctor';

const entries = await runHistory('CLAUDE.md', loadConfig(), 10);
// [{ sha, date, subject, score, grade, readinessScore, issues }]
```

---

## Formatters

```typescript
import {
  formatResult,
  formatResultJson,
  formatResults,
  formatResultsJson,
  formatReadinessReport,
  formatOrgReport,
  formatOrgReportJson,
  formatHistory,
  formatHistoryJson,
} from '@chiragdarji/agent-doctor';
```

All formatters accept `AnalysisResult` or `AnalysisResult[]` and return a formatted string.

---

## Core Types

```typescript
import type {
  AnalysisLayer,
  AnalysisResult,
  Config,
  FileType,
  Grade,
  Issue,
  LLMClient,
  LLMProvider,
  ParsedFile,
  PluginRule,
  RuleId,
  Section,
  Severity,
  StructuralRule,
  TargetPlatform,
} from '@chiragdarji/agent-doctor';
```

### `Issue`

```typescript
interface Issue {
  ruleId: RuleId;
  severity: Severity;       // 'critical' | 'warning' | 'suggestion'
  message: string;
  suggestion: string;
  line?: number;            // 1-indexed
  context?: string;         // offending text snippet
  relatedLine?: number;
}
```

### `AnalysisResult`

```typescript
interface AnalysisResult {
  file: string;
  score: number;            // 0–100
  grade: Grade;             // 'A' | 'B' | 'C' | 'D' | 'F'
  issues: Issue[];
  tokenCount: number;
  analysedAt: string;       // ISO timestamp
  layers: AnalysisLayer[];
  readinessScore: number;
  readinessDimensions: {
    observable: number;
    bounded: number;
    reversible: number;
    tooled: number;
    documented: number;
  };
}
```

### `StructuralRule`

```typescript
type StructuralRule = (content: string, filePath: string) => Issue[];
```

### `LLMClient`

```typescript
interface LLMClient {
  complete(params: {
    model: string;
    system: string;
    messages: LLMMessage[];
    maxTokens: number;
  }): Promise<LLMResponse>;
}
```

---

## Token Counting

```typescript
import { countTokens } from '@chiragdarji/agent-doctor';
const tokens = countTokens(markdownContent);
```

Uses `tiktoken` (cl100k_base). Falls back to `text.length / 4` if tiktoken is unavailable (e.g. in the VS Code extension).
