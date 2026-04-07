# agent-doctor — Cursor Semantic Analysis Skill

## Purpose

Use this skill when you want agent-doctor's **semantic analysis** inside Cursor
without needing a separate Anthropic or OpenAI API key.

Cursor's own LLM performs the semantic reasoning. agent-doctor's MCP server handles
the structural layer (13 rules, zero cost). This skill bridges them.

---

## How To Use

**Step 1 — Run structural analysis via MCP**

Ask Cursor:
```
Use the agent-doctor MCP tool to run structural analysis on my CLAUDE.md
```

Cursor calls `analyse_agent_file` with `layers: ["structural"]` and returns
a list of structural issues.

**Step 2 — Run semantic analysis via this skill**

Ask Cursor:
```
Now read the full contents of CLAUDE.md and perform semantic analysis as agent-doctor would.
Check for these specific issues:
```

---

## Semantic Rules To Check (paste these into Cursor)

Ask Cursor to evaluate the instruction file for each of the following:

### decision-loop [CRITICAL]
Do any two rules conflict on a common task?
Example: "Always ask before making changes" + "Complete tasks autonomously"
→ Flag both rules with line numbers and explain the conflict.

### contradiction [CRITICAL]
Do any rules directly oppose each other — not just on one task but fundamentally?
Example: "Never use TypeScript" + "All new files must be .ts"
→ Flag both rules.

### vague-boundary [WARNING]
Do any instructions lack a measurable success condition?
Words like "be helpful", "be concise", "use best practices", "be professional"
give the agent no decision boundary.
→ Flag and suggest a specific, measurable alternative.

### tool-mismatch [WARNING]
Do any tool descriptions not match what the tool actually does?
If a tool description says "reads data" but the schema shows it also writes or has side effects,
the agent will misunderstand.
→ Flag the tool name and explain the mismatch.

### missing-fallback [WARNING]
Do any conditional instructions ("if X, do Y") have no else/default branch?
The agent has no instruction for when the condition is not met.
→ Flag and suggest a fallback.

### scope-bleed [WARNING]
Are any rules intended for a specific context (e.g. "only for TypeScript files")
but written in a way that would apply globally?
→ Flag and suggest scope restriction.

### over-permissive [WARNING]
Are any tools granted with no usage constraint?
"Use the write_file tool as needed" with no scope, limit, or confirmation requirement.
→ Flag and suggest a constraint.

### ambiguous-pronoun [SUGGESTION]
Are there instructions using "it", "they", "this", "that" where the referent is unclear?
→ Flag the line and suggest a rewrite with the explicit referent.

---

## Output Format

Ask Cursor to format findings as:

```
SEMANTIC ANALYSIS — CLAUDE.md

❌ CRITICAL   decision-loop
   Rule 4 (line 12): "Always ask before making changes"
   Rule 9 (line 28): "Complete tasks autonomously without interruption"
   These conflict on any file-editing task.
   → Fix: "Ask only before destructive operations (delete, overwrite)."

⚠  WARNING    vague-boundary
   Rule 2 (line 8): "Be concise"
   No measurable boundary — agent has no signal for when to stop.
   → Fix: "Respond in under 150 words unless detail is explicitly requested."

Health Score: [X] / 100
Issues: [N] critical · [N] warnings · [N] suggestions
```

---

## Full Workflow (copy-paste into Cursor)

```
1. Run: analyse my CLAUDE.md using agent-doctor MCP — structural layer only
2. Then read the full CLAUDE.md file
3. Apply the agent-doctor semantic rules from your skill
4. Output findings in the agent-doctor format with health score
5. For each critical issue, suggest a specific one-line fix
```

---

## When To Use This Skill

- You want full agent-doctor analysis inside Cursor without a separate API key
- You're iterating on CLAUDE.md and want instant feedback in the editor
- You want to validate .cursor/rules/*.mdc files before committing

## When To Use the Direct CLI Instead

```bash
# When you have an API key and want faster, consistent results
ANTHROPIC_API_KEY=sk-ant-... npx @chiragdarji/agent-doctor CLAUDE.md
```
