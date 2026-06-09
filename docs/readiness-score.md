# Agent Readiness Score

The Agent Readiness Score measures how well an instruction file enables a reliable, predictable agent loop. It is computed from existing structural and semantic findings at zero extra API cost.

Every `AnalysisResult` includes:

```typescript
readinessScore: number;          // 0–100 aggregate
readinessDimensions: {
  observable: number;            // Can outcomes be verified?
  bounded: number;               // Is scope clearly defined?
  reversible: number;            // Are risky operations guarded?
  tooled: number;                // Are tools listed and accessible?
  documented: number;            // Is enough context provided?
};
```

---

## The Five Dimensions

Based on the Factory.ai Agent Readiness framework and OpenAI Harness Engineering principles.

### Observable
**Question:** Can the agent verify that it completed the task correctly?

An agent that cannot observe its own outcomes will either stall, over-run, or silently produce wrong results. Observable instructions include expected outputs, test commands, acceptance criteria, or review steps.

**Rules that affect this dimension:**
- `unobservable-outcome` (−25)
- `missing-success-criteria` (−20)

---

### Bounded
**Question:** Is the scope of the agent's authority clearly defined?

Unbounded agents make decisions outside their intended authority. Bounded instructions define what the agent may and may not do, what environment it assumes, and under what conditions each rule applies.

**Rules that affect this dimension:**
- `missing-fallback` (−20)
- `scope-bleed` (−20)
- `vague-boundary` (−15)
- `hardcoded-environment` (−15)
- `cross-file-conflict` (−15)
- `missing-agent-persona` (−10)
- `instruction-ordering` (−10)

---

### Reversible
**Question:** Are risky or destructive operations properly guarded?

Agents that can delete, deploy, migrate, or overwrite data must have explicit rollback, retry, or recovery guidance. Without it, a single failure can cause irreversible damage.

**Rules that affect this dimension:**
- `missing-recovery-strategy` (−25)
- `over-permissive` (−20)
- `sensitive-data` (−15)
- `instruction-ordering` (−10)

---

### Tooled
**Question:** Are the tools available to the agent clearly enumerated?

Agents that reference tools without a complete list may attempt to use tools that are not available, or fail to use tools that are. A tools section removes guesswork.

**Rules that affect this dimension:**
- `tool-mismatch` (−25)
- `missing-tool-list` (−20)

---

### Documented
**Question:** Does the file provide enough context for reliable operation?

An agent with incomplete documentation fills gaps with assumptions. Well-documented instruction files include a persona statement, examples for complex rules, and no placeholder or duplicate content.

**Rules that affect this dimension:**
- `sensitive-data` (−25)
- `todo-in-instructions` (−20)
- `missing-agent-persona` (−15)
- `empty-section` (−10)
- `ambiguous-pronoun` (−10)
- `redundant-instructions` (−10)
- `missing-examples` (−10)
- `cross-file-conflict` (−10)
- `missing-success-criteria` (−10)

---

## Scoring

Each dimension starts at 100. Deductions from matching issues are summed and clamped to `0`. The aggregate `readinessScore` is the unweighted average of all five dimensions.

**Example:**

```
Issues: missing-success-criteria (warning), missing-recovery-strategy (warning)

Observable:  100 − 20 = 80
Bounded:     100 − 10 = 90
Reversible:  100 − 25 = 75
Tooled:      100       = 100
Documented:  100 − 10 = 90

readinessScore = (80 + 90 + 75 + 100 + 90) / 5 = 87
```

Multiple issues of the same type on the same file stack: two `missing-success-criteria` issues deduct 40 from Observable and 20 from Bounded.

---

## CLI Output

The readiness score appears in the footer of every analysis:

```
Health Score   88 / 100  (B)
Readiness      87 / 100  obs 80 · bnd 90 · rev 75 · tld 100 · doc 90
```

### Full Readiness Report

Replace the issue list with a per-dimension breakdown:

```bash
agent-doctor CLAUDE.md --readiness-report
```

Output example:

```
Agent Readiness Report — CLAUDE.md
══════════════════════════════════

Observable         80 / 100  [████████░░]  ⚠
  • missing-success-criteria  (line 45)

Bounded            90 / 100  [█████████░]  ✓

Reversible         75 / 100  [███████░░░]  ⚠
  • missing-recovery-strategy  (line 32)

Tooled            100 / 100  [██████████]  ✓

Documented         90 / 100  [█████████░]  ✓

──────────────────────────────────────────
Readiness Score    87 / 100
```

---

## JSON Output

```json
{
  "readinessScore": 87,
  "readinessDimensions": {
    "observable": 80,
    "bounded": 90,
    "reversible": 75,
    "tooled": 100,
    "documented": 90
  }
}
```

---

## Programmatic API

```typescript
import { analyse } from '@chiragdarji/agent-doctor';

const result = await analyse('CLAUDE.md', config);
console.log(result.readinessScore);
console.log(result.readinessDimensions.reversible);
```
