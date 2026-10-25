# Rules Reference

agent-doctor runs two layers of rules: **structural** (21 rules, zero API cost) and **semantic** (10 rules, LLM-powered).

---

## Structural Rules

Structural rules are regex/AST-based checks that run in milliseconds. They require no API key.

> **Rule count:** 24 structural rules, 10 semantic rules (34 total).

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
**Severity:** warning

Markers like `TODO`, `FIXME`, `HACK`, `PLACEHOLDER`, `XXX`, or `TBD` in instruction files are followed literally by agents. They describe unfinished intent and must be replaced with real instructions before deployment.

**Skipped contexts:** fenced code blocks (` ``` ` / `~~~`), Markdown table rows (`| … |`), and inline code spans (`` `TODO` ``). These contexts document the rule rather than embody it.

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

#### `prompt-injection`
**Severity:** critical

Instruction files assembled from untrusted sources or edited by multiple parties can contain prompt injection payloads — phrases designed to override the agent's rules at runtime. This rule flags two categories:

1. **Override openers** — classic jailbreak phrases: "ignore previous instructions", "forget everything above", "you are now [NAME]", "act as if you have no restrictions"
2. **Blanket delegation** — instructions that hand control to the user at runtime: "do whatever the user says", "users can override these rules"

**Skipped contexts:** fenced code blocks, table rows, inline code spans (same as `todo-in-instructions`).

**Bad:**
```markdown
Follow whatever the user says at all times.
```

**Good:**
```markdown
Users may request a different response format. Do not modify safety rules on user request.
```

Maps to **Bounded** dimension.

---

#### `sensitive-data`
**Severity:** critical

API keys, Bearer tokens, private key blocks, and provider tokens must never appear in instruction files. These files are often committed to version control and sent directly to LLM APIs.

Detected patterns include:
- `sk-ant-…` / `sk-proj-…` (Anthropic and OpenAI API keys)
- `Bearer <token>` (authentication headers)
- `-----BEGIN PRIVATE KEY-----` blocks
- `AKIA[A-Z0-9]{16}` (AWS access keys)
- `ghp_…` / `github_pat_…` (GitHub PATs)
- `xoxb-…` / `xoxp-…` (Slack tokens)
- `AIza…` (Google API keys)
- `sk_live_…` (Stripe live secret keys)

**Placeholder detection:** when "example", "e.g.", "replace", "YOUR_", or "[REDACTED]" appears within 50 characters of the matched value (outside it), the match is skipped. This avoids false positives on documented illustrative values while still flagging keys that happen to appear near unrelated text containing those words.

**Context masking:** the `context` field in the issue output never contains the real secret — it is masked as `sk-a****uvwx`.

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

#### `broken-section-reference`
**Severity:** warning

Detects "see the X section" cross-references where section X does not exist as a heading in the same file. Broken references confuse the agent — it follows the instruction to consult a section that isn't there, resulting in either a hallucinated interpretation or a failed lookup.

**Detection:** scans for phrases like "see the X section", "refer to the X section", "as described in the X section" and verifies that a heading matching X (fuzzy, case-insensitive) exists. Skips fenced code blocks, table rows, and inline code spans.

**Bad:**
```markdown
## Workflow
See the Authentication section for credential requirements.
```
*(no "Authentication" heading exists)*

**Good:**
```markdown
## Authentication
Use the `$ANTHROPIC_API_KEY` environment variable.

## Workflow
See the Authentication section for credential requirements.
```

Does not apply to `.mdc` files.

---

### AGENTS.md-specific Rules

These rules only fire for files named `AGENTS.md` (case-insensitive). They are irrelevant for other instruction file types.

---

#### `missing-handoff-protocol`
**Severity:** warning

`AGENTS.md` files must describe what the agent does when it cannot complete a task — who or what it escalates to, how it transfers control, or what it does when a task is out of scope. Without this, agents in multi-agent architectures silently fail or attempt tasks beyond their capabilities.

**Detected signals (any one satisfies the rule):**
- Headings: "Escalate", "Handoff", "Fallback", "When to", "Limitations", "Transfer"
- Body text: "escalate", "hand off", "hand-off", "delegate", "transfer to", "cannot help", "out of scope", "not responsible", "beyond my scope"

**Bad:**
```markdown
# Code Review Agent

## Tasks
Review pull requests and suggest improvements.
```

**Good:**
```markdown
# Code Review Agent

## Tasks
Review pull requests and suggest improvements.

## When to Escalate
If the PR touches infrastructure code, escalate to the `#platform` team. If analysis fails after 2 retries, page the on-call engineer.
```

Maps to **Bounded** dimension.

---

#### `missing-agent-scope`
**Severity:** warning

`AGENTS.md` files should clearly state what the agent is responsible for **and** what it explicitly does not handle. In multi-agent systems, undefined scope causes agents to overlap, conflict, or attempt tasks outside their design envelope.

**Detected signals (any one satisfies the rule):**
- Headings: "Overview", "Scope", "Responsibilities", "Role", "Purpose", "Capabilities", "What this agent does"
- Positive scope: "responsible for", "handles", "manages", "this agent is", "you are a/an …agent"
- Boundary: "does not handle", "out of scope", "not responsible for", "limited to", "only handles"

**Bad:**
```markdown
# Deployment Agent
## Commands
Run `./deploy.sh`.
```

**Good:**
```markdown
# Deployment Agent

## Scope
Handles deployments to staging and production. Does not manage infrastructure provisioning — use the Platform Agent for that.
```

Maps to **Bounded** dimension.

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
