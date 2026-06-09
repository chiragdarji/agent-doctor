# Auto-Fix

agent-doctor can automatically repair seven structural rules without requiring manual editing.

## Usage

```bash
# Fix in-place
agent-doctor CLAUDE.md --fix

# Preview changes without writing
agent-doctor CLAUDE.md --fix --dry-run

# Fix all discovered files
agent-doctor --all --fix
```

`--dry-run` prints the would-be content to stdout and exits without touching any file.

---

## Fixable Rules

### `todo-in-instructions`

Replaces lines containing `TODO`, `FIXME`, `HACK`, `PLACEHOLDER`, `XXX`, or `TBD` with an HTML comment that preserves the line position.

**Before:**
```markdown
TODO: add tool constraints here
```

**After:**
```markdown
<!-- TODO removed by agent-doctor — replace with actual instruction -->
```

---

### `unclosed-code-block`

Appends a closing ` ``` ` fence at the end of the file.

**Before:**
````markdown
Run this command:
```bash
npm install
````

**After:**
````markdown
Run this command:
```bash
npm install
```
````

---

### `empty-section`

Inserts a placeholder line after headings that have no body content. Applied in reverse line-number order so earlier insertions don't shift later line numbers.

**Before:**
```markdown
## Tools

## Code Style
Use 2-space indentation.
```

**After:**
```markdown
## Tools

_No content yet — add instructions here._

## Code Style
Use 2-space indentation.
```

---

### `missing-success-criteria`

Inserts a success criteria stub before the next heading for task sections that lack a completion signal. Applied in reverse order.

**Before:**
```markdown
## Deploy
Push to main to trigger the CI pipeline.

## Rollback
```

**After:**
```markdown
## Deploy
Push to main to trigger the CI pipeline.

> ✅ **Success criteria:** Done when _<describe the expected outcome>_

## Rollback
```

---

### `sensitive-data`

Redacts matched credentials with `[REDACTED]`. For `key=value` patterns, only the value is redacted; the key name is preserved.

**Before:**
```markdown
Set your API key: ANTHROPIC_API_KEY=sk-ant-abc123xyz
Authorization: Bearer ghp_abc123456789
```

**After:**
```markdown
Set your API key: ANTHROPIC_API_KEY=[REDACTED]
Authorization: Bearer [REDACTED]
```

Detected patterns:
- `sk-[A-Za-z0-9]{20,}` — Anthropic / OpenAI keys
- `Bearer <token>` — Authorization header values
- `-----BEGIN PRIVATE KEY-----` blocks
- `AKIA[A-Z0-9]{16}` — AWS access keys
- `ghp_[A-Za-z0-9]{20,}` — GitHub PATs
- `api_key=<value>`, `apikey=<value>` — generic key=value pairs

---

### `missing-agent-persona`

Prepends a persona stub at the top of the file (after the YAML frontmatter block if one exists).

**Before:**
```markdown
## Code Style
Use 2-space indentation.
```

**After:**
```markdown
<!-- agent-doctor: update this persona statement -->
You are a helpful AI assistant. Describe your specific role, expertise, and constraints here.

## Code Style
Use 2-space indentation.
```

---

### `hardcoded-environment`

Replaces machine-specific paths and ports with portable environment variable references.

| Pattern | Replacement |
|---------|-------------|
| `/home/user/...` | `$HOME/...` |
| `/home/<name>/...` | `$HOME/...` |
| `/usr/...`, `/etc/...`, `/var/...`, `/root/...` | `${PROJECT_ROOT}/...` |
| `C:\...`, `D:\...` | `%PROJECT_ROOT%\...` |
| `%APPDATA%\...` | `%PROJECT_ROOT%\...` |
| `localhost:3000` (and other ports) | `localhost:$PORT` |

Replacements inside code blocks are not modified.

---

## Non-Fixable Rules

The following rules require manual review and cannot be auto-fixed:

| Rule | Reason |
|------|--------|
| `legacy-format` | Renaming `.cursorrules` requires moving the file and updating references |
| `duplicate-heading` | Requires understanding which heading to rename or which section to merge |
| `missing-frontmatter` | Requires knowing the correct `alwaysApply`, `description`, and `globs` values |
| `missing-always-apply` | Requires knowing the intended activation scope |
| `negation-heavy` | Requires understanding the intent of each bullet |
| `instruction-ordering` | Requires moving entire sections |
| All semantic rules | Require human judgment to resolve conflicts and ambiguities |

---

## Programmatic API

```typescript
import { applyFixes } from '@chiragdarji/agent-doctor';

const result = await applyFixes('CLAUDE.md', issues, { dryRun: false });
console.log('Fixed:', result.fixed);
console.log('Skipped:', result.skipped);

// Dry run
const preview = await applyFixes('CLAUDE.md', issues, { dryRun: true });
console.log(preview.preview);
```

```typescript
interface FixResult {
  fixed: RuleId[];      // Rules that were successfully fixed
  skipped: RuleId[];    // Rules present but with no auto-fix
  preview?: string;     // Only populated in dry-run mode
}
```
