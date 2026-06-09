# Custom Plugins

agent-doctor supports custom structural rules via plugin modules. Load them via `.agentdoctor.json` without forking the project.

## Registering Plugins

Add plugin paths to `.agentdoctor.json`:

```json
{
  "plugins": [
    "./rules/no-emoji.js",
    "./rules/house-style.js",
    "@my-org/agent-doctor-rules"
  ]
}
```

- **Relative paths** (starting with `./`) resolve from the directory where the CLI is run.
- **Bare specifiers** are treated as npm package names and resolved via Node's standard module resolution.

---

## Writing a Plugin

A plugin is an ES module that exports one or more functions. Every exported function is collected and run as a structural rule.

### Default Export (single rule)

```javascript
// rules/no-emoji.js
export default function noEmoji(content, filePath) {
  const matches = [...content.matchAll(/\p{Emoji}/gu)];
  if (matches.length === 0) return [];

  return [{
    ruleId: 'my-org/no-emoji',
    severity: 'warning',
    message: `${matches.length} emoji found in instruction file`,
    suggestion: 'Replace emoji with plain descriptive text for reliable agent parsing',
    line: 1,
  }];
}
```

### Named Exports (multiple rules)

```javascript
// rules/house-style.js
export function noEmoji(content) { ... }
export function requireOwnerSection(content) { ... }
export function maxSections(content) { ... }
```

All exported functions are collected automatically.

---

## Plugin Function Signature

```typescript
type StructuralRule = (content: string, filePath: string) => Issue[];
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | `string` | Full raw file content including frontmatter |
| `filePath` | `string` | Absolute path to the file |
| Return | `Issue[]` | Array of issues found; `[]` if none |

### Issue Shape

```typescript
interface Issue {
  ruleId: string;       // Unique ID, e.g. 'my-org/no-emoji'
  severity: 'critical' | 'warning' | 'suggestion';
  message: string;      // What was found
  suggestion: string;   // How to fix it
  line?: number;        // 1-indexed line number (optional)
  context?: string;     // Offending text snippet (optional)
  relatedLine?: number; // Secondary line reference (optional)
}
```

`ruleId` can be any string. It is not required to match a built-in identifier. Using a namespace prefix (e.g. `my-org/rule-name`) avoids collisions with built-in rule IDs.

---

## TypeScript Plugins

Install the package as a dev dependency for type support:

```bash
npm install --save-dev @chiragdarji/agent-doctor
```

```typescript
// rules/no-emoji.ts
import type { PluginRule } from '@chiragdarji/agent-doctor';

export const noEmoji: PluginRule = (content, filePath) => {
  // ...
  return [];
};
```

Compile to `.js` before use, or use `tsx` for development.

---

## Disabling Plugin Rules

Plugin rules can be turned off via `config.rules` exactly like built-in rules:

```json
{
  "rules": {
    "my-org/no-emoji": "off",
    "my-org/require-owner-section": "warning"
  }
}
```

---

## Error Handling

Invalid plugins and import errors are logged as warnings and skipped — analysis continues on the remaining files. A plugin that throws during execution has its error logged and is skipped for that file.

---

## Distributing Plugins as npm Packages

```javascript
// index.js (your npm package main)
export function noEmoji(content) { ... }
export function requireOwner(content) { ... }
```

Users install and reference the package:

```json
{
  "devDependencies": {
    "@my-org/agent-doctor-rules": "^1.0.0"
  },
  "agentdoctor": {
    "plugins": ["@my-org/agent-doctor-rules"]
  }
}
```

---

## Programmatic Plugin Loading

```typescript
import { loadPlugins, runStructuralAnalysis, parseFile, loadConfig } from '@chiragdarji/agent-doctor';

const pluginRules = await loadPlugins(['./rules/no-emoji.js'], process.cwd());
const parsed = parseFile('CLAUDE.md');
const issues = runStructuralAnalysis(parsed, loadConfig(), pluginRules);
```
