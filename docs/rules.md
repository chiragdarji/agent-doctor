# Rules Reference

agent-doctor runs two layers of rules: **structural** (21 rules, zero API cost) and **semantic** (10 rules, LLM-powered).

---

## Structural Rules

Structural rules are regex/AST-based checks that run in milliseconds. They require no API key.

### Format & Frontmatter

These rules apply primarily to Cursor `.mdc` files, which require YAML frontmatter for correct behaviour.

---

#### `missing-frontmatter`
**Severity:** critical (`.mdc`), warning (others)

`.mdc` files must start with a `---` YAML frontmatter block. Without it, Cursor ignores the file entirely in agent mode.

**Bad:**
```markdown
Always write tests before implementation.
```

**Good:**
```markdown
---
alwaysApply: true
description: "TDD workflow rules"
---
Always write tests before implementation.
```

---

#### `missing-always-apply`
**Severity:** warning (promoted to critical on Cursor platform)

`.mdc` files should have `alwaysApply: true` in frontmatter. Without it, Cursor skips the rule in agent mode unless a glob matches the current file.

---

#### `missing-description`
**Severity:** warning

`.mdc` files should have a `description` field in frontmatter. Cursor uses this for contextual rule matching and UI display.

---

#### `conflicting-frontmatter`
**Severity:** warning

Having both `alwaysApply: true` and `globs` is contradictory. Cursor will apply the rule to every file regardless of globs, making the glob definition misleading.

---

#### `missing-file-glob`
**Severity:** warning

If `alwaysApply: false` and no `globs` pattern is defined, the rule will never activate — it has no trigger condition.

---

#### `legacy-format`
**Severity:** warning

`.cursorrules` files are not loaded in Cursor agent mode. Rename to `AGENTS.md` or move to `.cursor/rules/*.mdc`.

---

### Content Quality

---

#### `unclosed-code-block`
**Severity:** critical

An odd number of ` ``` ` or `~~~` fences means everything after the unclosed fence is treated as a code block by markdown parsers and agents. The agent may never read the rest of the file.

---

#### `todo-in-instructions`
**Severity:** critical

Markers like `TODO`, `FIXME`, `HACK`, `PLACEHOLDER`, `XXX`, or `TBD` in instruction files are followed literally by agents. They describe unfinished intent and must be replaced with real instructions before deployment.

**Auto-fixable:** replaces the line with an HTML comment.

---

#### `duplicate-heading`
**Severity:** warning

The same heading text (case-insensitive) appearing twice creates ambiguity. Agents cannot determine which section takes precedence when headings conflict.

---

#### `empty-section`
**Severity:** suggestion

A heading with no body content and no child sub-headings adds noise without value. Either add content or remove the heading.

**Auto-fixable:** inserts a placeholder line under the heading.

---

#### `heading-depth-skip`
**Severity:** suggestion

Jumping from `##` to `####` (skipping `###`) breaks the heading hierarchy that agents use to determine scope and nesting. Each level should increment by one.

---

#### `negation-heavy`
**Severity:** suggestion

When more than 60% of bullet points in a section use negation ("don't", "never", "avoid", "do not"), the section is harder for agents to parse reliably. Rewrite as positive instructions where possible.

**Bad:**
```markdown
- Don't use var
- Never use == for equality
- Avoid callbacks, don't use them
```

**Good:**
```markdown
- Use const or let
- Use === for equality
- Use async/await instead of callbacks
```

---

#### `token-budget-exceeded`
**Severity:** warning

A section exceeds the configured token threshold (default: 500 tokens). Long sections risk overloading the agent's context window. Split into sub-sections or move detail to referenced files.

---

### Agent Readiness

---

#### `missing-success-criteria`
**Severity:** warning

Task sections that use imperative verbs (`implement`, `build`, `create`, `deploy`, `execute`, `generate`, `run`, `migrate`) with no measurable completion signal leave the agent unable to determine when it is done.

Add language like: "Done when…", "Verify by running…", "Success if all tests pass", "Expected output:…"

**Bad:**
```markdown
## Deploy
Deploy the application to production.
```

**Good:**
```markdown
## Deploy
Deploy the application to production.

> ✅ **Success criteria:** Done when the health check at `/status` returns HTTP 200.
```

**Auto-fixable:** inserts a success criteria stub before the next heading.

Maps to **Observable** dimension.

---

#### `hardcoded-environment`
**Severity:** warning

Absolute paths (`/home/user/project`, `C:\Users\name\`, `/usr/local/bin`) or `localhost:PORT` references tie the instruction file to a specific machine. Agents running in different environments will fail.

**Bad:**
```markdown
Run the server: `/home/user/myapp/start.sh`
Open: `http://localhost:3000/api`
```

**Good:**
```markdown
Run the server: `$HOME/myapp/start.sh`
Open: `http://localhost:$PORT/api`
```

**Auto-fixable:** replaces common path patterns with environment variable equivalents.

Maps to **Bounded** dimension.

---

#### `sensitive-data`
**Severity:** critical

API keys, Bearer tokens, private key blocks, AWS access keys, and GitHub personal access tokens must never appear in instruction files. These files are often committed to version control and sent to LLM APIs.

Detected patterns include:
- `sk-[A-Za-z0-9]{20,}` (Anthropic/OpenAI keys)
- `Bearer <token>` (authentication headers)
- `-----BEGIN PRIVATE KEY-----` blocks
- `AKIA[A-Z0-9]{16}` (AWS access keys)
- `ghp_[A-Za-z0-9]{20,}` (GitHub PATs)

Lines containing "example", "e.g.", "placeholder", "YOUR_", or "[REDACTED]" are skipped.

**Auto-fixable:** replaces matched credentials with `[REDACTED]`.

Maps to **Documented** and **Reversible** dimensions.

---

#### `missing-agent-persona`
**Severity:** warning

Files with no role or identity statement give the agent no grounding for its behaviour. A persona statement at the top of the file establishes who the agent is and what it is responsible for.

**Bad:**
```markdown
## Code Style
Use 2-space indentation.
```

**Good:**
```markdown
You are a senior TypeScript engineer focused on maintainability and test coverage.

## Code Style
Use 2-space indentation.
```

**Auto-fixable:** prepends a persona stub (after frontmatter if present).

Maps to **Documented** and **Bounded** dimensions.

---

#### `redundant-instructions`
**Severity:** warning

When the same directive appears three or more times with high word-overlap similarity (Jaccard ≥ 0.75), it indicates copy-paste repetition. Repeated rules create noise and may cause the agent to over-weight the directive at the expense of other instructions.

Maps to **Documented** dimension.

---

#### `missing-examples`
**Severity:** suggestion

Sections with complex multi-condition logic (three or more `if/then`, `when/use`, `must/should` constructs) and no code block or inline `e.g.` example are harder for agents to apply correctly.

Maps to **Documented** dimension.

---

#### `instruction-ordering`
**Severity:** suggestion

Security, access, and constraint sections (headings containing words like "security", "permissions", "guardrails", "forbidden", "restricted") that appear after task sections may be missed or overridden by earlier task framing. Agents process instructions in order.

Maps to **Reversible** and **Bounded** dimensions.

---

### Missing Tool List

#### `missing-tool-list`
**Severity:** suggestion

If the file references tools by name ("use the X tool", "call", "invoke", "you have access to") but has no section with a heading containing "tools", "capabilities", "available", or "commands", the agent may attempt to use tools that are not actually available.

Maps to **Tooled** dimension.

---

## Semantic Rules

Semantic rules require an LLM API key. They find issues that pattern matching cannot catch.

Configure with:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
agent-doctor CLAUDE.md
```

---

### Critical

#### `decision-loop`
**Severity:** critical

Two or more rules conflict on a common task, causing the agent to loop indefinitely or stall. Unlike `contradiction`, this is not a logical impossibility — the agent could technically satisfy both rules at different times, but cannot determine which to apply when they overlap.

**Bad:**
```markdown
Always ask for confirmation before making changes.
Complete tasks autonomously without interrupting the user.
```

---

#### `contradiction`
**Severity:** critical

Two rules are logically impossible to satisfy simultaneously. The agent will fail or produce unpredictable behaviour.

**Bad:**
```markdown
Never modify test files.
Refactor tests to improve coverage and reduce duplication.
```

---

### Warning

#### `vague-boundary`
**Severity:** warning

An instruction has no measurable success condition. The agent cannot determine when it has done enough.

**Bad:** "Be concise."
**Good:** "Keep responses under 3 sentences unless the user asks for detail."

---

#### `tool-mismatch`
**Severity:** warning

A tool's description in the instruction file does not match what the tool's actual schema does. The agent will misuse the tool.

---

#### `missing-fallback`
**Severity:** warning

A conditional instruction (`if X, do Y`) has no guidance for the common case where X is not true. The agent has no defined behaviour for that path.

---

#### `scope-bleed`
**Severity:** warning

A rule intended for a specific context (e.g. "in production") is written without that qualifier, making it apply globally in situations where it should not.

**Bad:** "Never delete files."
**Good:** "Never delete files in the production database directory."

---

#### `over-permissive`
**Severity:** warning

A high-blast-radius destructive tool is granted with no constraints, qualifiers, or required confirmation steps.

---

#### `missing-recovery-strategy`
**Severity:** warning

A destructive or risky operation (`deploy`, `delete`, `drop`, `migrate`, `reset`, `truncate`, `wipe`) is described with no error handling, rollback procedure, or recovery guidance.

**Bad:** "Run the deploy script when the feature is complete."
**Good:** "Run `./deploy.sh`. If it exits non-zero, run `./rollback.sh` and notify the team in #incidents."

Maps to **Reversible** dimension.

---

### Suggestion

#### `ambiguous-pronoun`
**Severity:** suggestion

Pronouns like "it", "they", "this", "that", or "the above" have an unclear referent, which could cause the agent to act on the wrong target.

**Bad:** "If the test fails, fix it and re-run it."
**Good:** "If the test fails, fix the failing assertion and re-run the test suite."

---

#### `unobservable-outcome`
**Severity:** suggestion

A task is described with no way for the agent to verify it completed correctly — no expected output, no test to run, no assertion to check.

**Bad:** "Implement the payment gateway integration."
**Good:** "Implement the payment gateway. Verify by running `npm test -- payment` — all 12 tests must pass."

Maps to **Observable** dimension.

---

## Cross-file Rule

#### `cross-file-conflict`
**Severity:** warning

Instructions in different files contradict each other. This rule only fires when two or more files are analysed together (via `--all`, `analyse_agent_file` with multiple paths, or `analyseCrossFile()`).

**Example:** `CLAUDE.md` says "Always respond formally" while `AGENTS.md` says "Use casual, friendly tone."

---

## Severity Reference

| Severity | Score deduction | Default diagnostic level |
|----------|----------------|--------------------------|
| `critical` | −20 per issue | Error |
| `warning` | −10 per issue | Warning |
| `suggestion` | −3 per issue | Hint |

Override any rule severity in [`.agentdoctor.json`](./configuration.md):

```json
{
  "rules": {
    "negation-heavy": "off",
    "heading-depth-skip": "warning",
    "missing-always-apply": "critical"
  }
}
```
