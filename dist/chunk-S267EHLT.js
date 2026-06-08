#!/usr/bin/env node
import {
  parseFile
} from "./chunk-XTBU7AIN.js";
import {
  runStructuralAnalysis
} from "./chunk-RXZSUZDW.js";

// src/analyser/semantic.ts
import { z } from "zod";

// src/logger.ts
var LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
function createLogger(minLevel) {
  const min = LEVELS[minLevel];
  function log(level, message) {
    if (LEVELS[level] !== void 0 && LEVELS[level] >= min) {
      process.stderr.write(`[agent-doctor:${level}] ${message}
`);
    }
  }
  return {
    debug: (m) => log("debug", m),
    info: (m) => log("info", m),
    warn: (m) => log("warn", m),
    error: (m) => log("error", m)
  };
}
var VALID_LEVELS = ["debug", "info", "warn", "error"];
var envLevel = process.env["AGENT_DOCTOR_LOG_LEVEL"];
var resolvedLevel = envLevel !== void 0 && VALID_LEVELS.includes(envLevel) ? envLevel : "warn";
var logger = createLogger(resolvedLevel);

// src/analyser/semantic-prompt.ts
var SEMANTIC_SYSTEM_PROMPT = `You are a semantic analyser for AI agent instruction files (CLAUDE.md, AGENTS.md, Cursor rules, etc.).

Your job is to find semantic problems \u2014 issues that structural linters miss because they require
understanding what an agent will *do* with each instruction at runtime.

You will receive the contents of one agent instruction file. Analyse it for the rules below.

\u2501\u2501\u2501 RULES \u2501\u2501\u2501

1. decision-loop  (severity: critical)
   Two or more instructions that conflict on a common task, causing the agent to stall,
   loop, or silently ignore one of them.
   BAD: "Always ask the user before making changes" + "Complete all tasks autonomously without interruption"
   BAD: "Be concise in every response" + "Always provide thorough context and full explanations"
   GOOD: "Ask before destructive operations (delete, overwrite). Proceed autonomously for additive work."
   Trigger: contradictory autonomy levels, contradictory confirmation requirements, contradictory verbosity.

2. contradiction  (severity: critical)
   Instructions that are logically impossible to satisfy simultaneously, with no scope qualification.
   BAD: "Never modify existing tests" + "Refactor code to improve test coverage"
   BAD: "Always use TypeScript" + "Write automation scripts in Python"
   GOOD (scoped): "Never modify existing tests unless the PR explicitly asks for test changes"
   Different from decision-loop: a contradiction is a logical impossibility, not just a conflict on one task.

3. vague-boundary  (severity: warning)
   An instruction with no measurable success condition \u2014 the agent cannot determine when it has satisfied it.
   BAD: "Be helpful and concise" \u2014 no threshold for what counts as concise
   BAD: "Write good code" \u2014 no definition of good
   BAD: "Respond appropriately" \u2014 no signal for what appropriate means in context
   GOOD: "Respond in under 150 words unless the user explicitly asks for detail"
   Flag ONLY when vagueness will cause unpredictable behaviour across different interactions.
   Do NOT flag every instruction \u2014 many are intentionally high-level.

4. tool-mismatch  (severity: warning)
   A tool is described in a way that doesn't match its actual behaviour, causing the agent to misuse it.
   BAD: Tool described as "fetches read-only user data" but schema shows it also writes audit logs
   BAD: Tool described as "safe lookup" but has a parameter named write_back or delete
   ONLY flag if you can identify a specific, concrete mismatch from what is written in the file.
   Do NOT invent tool behaviour that is not described.

5. missing-fallback  (severity: warning)
   A conditional instruction ("if X, do Y") with no branch for when X is not true.
   BAD: "If the user asks for a code review, check for security issues" \u2014 no guidance for other review types
   GOOD: "If the user asks for a code review, check security. Otherwise focus on correctness and style."
   Flag ONLY if the missing case is common and leaves the agent without guidance.

6. scope-bleed  (severity: warning)
   A rule intended for one specific context is written so broadly that it applies everywhere, creating
   unintended restrictions or behaviours.
   BAD: "Never delete files" \u2014 intended for production code, now blocks test cleanup
   BAD: "Always respond in formal English" \u2014 intended for customer-facing output, now applies to debug logs
   Look for: global prohibitions that should be scoped, missing qualifiers like "in production", "for user-facing output".

7. over-permissive  (severity: warning)
   A destructive or irreversible tool or capability is granted with no constraints on when to use it.
   BAD: "You have access to the delete_records tool." \u2014 no constraint
   GOOD: "Use delete_records only when the user explicitly confirms deletion and the target is not in production."
   Flag ONLY for tools with destructive, irreversible, or high-blast-radius effects.

8. ambiguous-pronoun  (severity: suggestion)
   "it", "they", "this", "that", or "the above" used with no clear referent \u2014 the agent may operate
   on the wrong target.
   BAD: "If the test fails, fix it and re-run it." \u2014 fix what? The test? The source code? The config?
   GOOD: "If the test fails, fix the source code and re-run the test suite."
   Flag ONLY if the ambiguity could cause the agent to act on the wrong object.

9. missing-recovery-strategy  (severity: warning)
   Instructions reference a destructive or risky operation (deploy, delete, drop, migrate, overwrite,
   wipe, reset, truncate, remove) with no error handling, rollback, retry, or recovery guidance nearby.
   BAD: "Run the deploy script when the feature is complete."
   BAD: "Delete all records older than 30 days at midnight."
   GOOD: "Run the deploy script. If it exits non-zero, run ./rollback.sh and page the on-call engineer."
   GOOD: "Delete records older than 30 days. If deletion fails, log the error and abort \u2014 do not retry."
   Flag ONLY for genuinely destructive or irreversible operations; do not flag additive operations.

10. unobservable-outcome  (severity: warning)
    A task is described but there is no way for the agent to verify that it completed it correctly \u2014
    no tests, assertions, expected output, review step, or acceptance criteria mentioned.
    BAD: "Implement the payment gateway integration."
    BAD: "Refactor the authentication module for clarity."
    GOOD: "Implement the payment gateway. Verify by running npm test -- payment and confirming all 12 tests pass."
    GOOD: "Refactor the auth module. The refactor is complete when all existing tests still pass and
          no new type errors appear."
    Flag ONLY when a task is non-trivial and there is genuinely no observable completion signal
    anywhere in the file for that task.

\u2501\u2501\u2501 OUTPUT FORMAT \u2501\u2501\u2501

Return ONLY a valid JSON array. No prose, no markdown fences, no explanation outside the JSON.
If you find no issues, return exactly: []

Each element must match this shape exactly:
{
  "ruleId": "<one of: decision-loop | contradiction | vague-boundary | tool-mismatch | missing-fallback | scope-bleed | over-permissive | ambiguous-pronoun | missing-recovery-strategy | unobservable-outcome>",
  "severity": "<critical | warning | suggestion>",
  "message": "<one sentence: what the specific problem is>",
  "suggestion": "<one concrete sentence: how to fix it>",
  "context": "<the exact offending text from the file, 1\u20132 sentences max>",
  "line": <line number as integer if identifiable, otherwise omit this field>
}

\u2501\u2501\u2501 CONSTRAINTS \u2501\u2501\u2501

- Return at most 10 issues. Prioritise the most impactful ones.
- Do NOT flag structural issues (missing frontmatter, empty sections, file format problems).
- Do NOT flag style preferences or things that are merely suboptimal.
- Be conservative: a false negative is better than a false positive.
- Each issue must quote the specific offending text in "context" \u2014 do not describe it abstractly.
- "message" must name the specific instructions involved, not just the rule category.
`;
var CROSS_FILE_SYSTEM_PROMPT = `You are a cross-file conflict analyser for AI agent instruction files (CLAUDE.md, AGENTS.md, Cursor rules, etc.).

You will receive 2 or more agent instruction files. Find ONLY cross-file conflicts \u2014 instructions in
different files that directly contradict or interfere with each other.

\u2501\u2501\u2501 RULE \u2501\u2501\u2501

cross-file-conflict  (severity: warning)
  Two or more files contain instructions that cannot be followed simultaneously \u2014 they contradict
  each other on the same topic in a way that would cause inconsistent agent behaviour depending on
  which file is active or which instruction the agent encounters first.

  BAD: CLAUDE.md says "Always respond in formal English" + AGENTS.md says "Use casual, friendly tone \u2014 avoid formality"
  BAD: CLAUDE.md says "Never run tests automatically" + .cursor/rules/main.mdc says "Run the full test suite after every code change"
  BAD: CLAUDE.md says "Ask the user before deleting any file" + AGENTS.md says "Clean up temporary files autonomously without asking"
  GOOD: CLAUDE.md covers project overview; AGENTS.md adds platform-specific workflow \u2014 no conflict (complementary)
  GOOD: Both files say "write concise commit messages" \u2014 duplication, not conflict

WHAT IS NOT A CONFLICT:
  - The same instruction appearing in multiple files (duplication, not conflict)
  - Different levels of detail on the same topic (elaboration, not conflict)
  - Instructions that apply to different contexts or file types
  - One file being silent on a topic that another covers

\u2501\u2501\u2501 OUTPUT FORMAT \u2501\u2501\u2501

Return ONLY a valid JSON array. No prose, no markdown fences, no explanation outside the JSON.
If there are no conflicts, return exactly: []

Each element must match this shape exactly:
{
  "ruleId": "cross-file-conflict",
  "severity": "warning",
  "message": "<one sentence: which files conflict and what specifically contradicts>",
  "suggestion": "<one concrete sentence: how to resolve \u2014 e.g. pick one, scope them, or unify>",
  "context": "<the exact conflicting instructions from each file, labelled by filename>"
}

\u2501\u2501\u2501 CONSTRAINTS \u2501\u2501\u2501

- Return at most 5 conflicts. Prioritise the most severe ones.
- Every conflict must involve at least one instruction from two different files.
- Name the files by their filename in both "message" and "context".
- Be conservative: a false negative (missing a real conflict) is better than a false positive.
- Do NOT flag structural issues (missing frontmatter, empty sections).
`;

// src/analyser/llm-client.ts
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
var OPENAI_MODEL_PREFIXES = ["gpt-", "o1-", "o3-", "o4-"];
function inferProvider(model) {
  const lower = model.toLowerCase();
  return OPENAI_MODEL_PREFIXES.some((p) => lower.startsWith(p)) ? "openai" : "anthropic";
}
function resolveProvider(config) {
  return config.provider ?? inferProvider(config.model);
}
function createOpenAICompatibleClient(baseURL, apiKey = "ollama") {
  const sdk = new OpenAI({ apiKey, baseURL });
  return {
    async complete({ model, system, messages, maxTokens }) {
      const response = await sdk.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          ...messages.map((m) => ({ role: m.role, content: m.content }))
        ]
      });
      return { text: response.choices[0]?.message.content ?? "" };
    }
  };
}
function createAnthropicClient(apiKey) {
  const sdk = new Anthropic({ apiKey });
  return {
    async complete({ model, system, messages, maxTokens }) {
      const response = await sdk.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages
      });
      const block = response.content[0];
      return { text: (block?.type === "text" ? block.text : "") ?? "" };
    }
  };
}
function createOpenAIClient(apiKey) {
  const sdk = new OpenAI({ apiKey });
  return {
    async complete({ model, system, messages, maxTokens }) {
      const response = await sdk.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          ...messages.map((m) => ({ role: m.role, content: m.content }))
        ]
      });
      return { text: response.choices[0]?.message.content ?? "" };
    }
  };
}
function createClientFromConfig(config) {
  const provider = resolveProvider(config);
  if (provider === "openai-compatible") {
    if (!config.baseURL) return null;
    const key2 = process.env["OPENAI_API_KEY"] ?? "ollama";
    return createOpenAICompatibleClient(config.baseURL, key2);
  }
  if (provider === "openai") {
    const key2 = process.env["OPENAI_API_KEY"];
    if (!key2) return null;
    return createOpenAIClient(key2);
  }
  const key = process.env["ANTHROPIC_API_KEY"];
  if (!key) return null;
  return createAnthropicClient(key);
}

// src/analyser/semantic.ts
var SEMANTIC_RULE_IDS = [
  "decision-loop",
  "contradiction",
  "vague-boundary",
  "tool-mismatch",
  "missing-fallback",
  "scope-bleed",
  "over-permissive",
  "ambiguous-pronoun",
  "missing-recovery-strategy",
  "unobservable-outcome"
];
var IssueSchema = z.object({
  ruleId: z.enum(SEMANTIC_RULE_IDS),
  severity: z.enum(["critical", "warning", "suggestion"]),
  message: z.string().min(1),
  suggestion: z.string().min(1),
  context: z.string().optional(),
  line: z.number().int().positive().optional(),
  relatedLine: z.number().int().positive().optional()
});
var ResponseSchema = z.array(IssueSchema).max(10);
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) return arrayMatch[0];
  return text.trim();
}
async function analyseSemantics(content, filePath, config, client) {
  const resolvedClient = client ?? createClientFromConfig(config);
  if (!resolvedClient) {
    const provider = resolveProvider(config);
    const envVar = provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
    logger.warn(
      `${envVar} is not set \u2014 skipping semantic analysis. Run with --structural-only to suppress this warning.`
    );
    return [];
  }
  let rawText;
  try {
    const response = await resolvedClient.complete({
      model: config.model,
      maxTokens: 2048,
      system: SEMANTIC_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyse this agent instruction file for semantic issues.
File: ${filePath}

---
${content}
---`
        }
      ]
    });
    rawText = response.text;
  } catch (err) {
    logger.error(`Semantic analysis API call failed: ${String(err)}`);
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(extractJson(rawText));
  } catch {
    logger.warn(`Semantic response is not valid JSON. Raw response:
${rawText.slice(0, 200)}`);
    return [];
  }
  const validated = ResponseSchema.safeParse(parsed);
  if (!validated.success) {
    logger.warn(`Semantic response failed schema validation: ${JSON.stringify(validated.error.issues, null, 2)}`);
    return [];
  }
  logger.info(`Semantic analysis found ${validated.data.length.toString()} issue(s)`);
  return validated.data;
}

// src/analyser/multi-file-semantic.ts
import { z as z2 } from "zod";
var CrossFileIssueSchema = z2.object({
  ruleId: z2.literal("cross-file-conflict"),
  severity: z2.enum(["critical", "warning", "suggestion"]),
  message: z2.string().min(1),
  suggestion: z2.string().min(1),
  context: z2.string().optional()
});
var CrossFileResponseSchema = z2.array(CrossFileIssueSchema).max(5);
async function multiFileSemantics(files, config, client) {
  if (files.length < 2) return [];
  const resolvedClient = client ?? createClientFromConfig(config);
  if (!resolvedClient) {
    const provider = resolveProvider(config);
    const envVar = provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
    logger.warn(`${envVar} is not set \u2014 skipping cross-file semantic analysis.`);
    return [];
  }
  const fileBlocks = files.map((f) => `FILE: ${f.filePath}
---
${f.content}
---`).join("\n\n");
  let rawText;
  try {
    const response = await resolvedClient.complete({
      model: config.model,
      maxTokens: 1024,
      system: CROSS_FILE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyse these ${files.length.toString()} agent instruction files for cross-file conflicts:

${fileBlocks}`
        }
      ]
    });
    rawText = response.text;
  } catch (err) {
    logger.error(`Cross-file semantic analysis API call failed: ${String(err)}`);
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(extractJson(rawText));
  } catch {
    logger.warn(
      `Cross-file semantic response is not valid JSON. Raw:
${rawText.slice(0, 200)}`
    );
    return [];
  }
  const validated = CrossFileResponseSchema.safeParse(parsed);
  if (!validated.success) {
    logger.warn(
      `Cross-file semantic response failed schema validation: ${JSON.stringify(validated.error.issues, null, 2)}`
    );
    return [];
  }
  logger.info(`Cross-file analysis found ${validated.data.length.toString()} conflict(s)`);
  return validated.data;
}

// src/plugin-loader.ts
import { resolve } from "path";
async function loadPlugins(pluginPaths, cwd) {
  const rules = [];
  for (const pluginPath of pluginPaths) {
    const absPath = pluginPath.startsWith(".") ? resolve(cwd, pluginPath) : pluginPath;
    try {
      const mod = await import(absPath);
      const collected = collectFunctions(mod);
      if (collected.length === 0) {
        logger.warn(`Plugin "${pluginPath}" exports no functions \u2014 skipped`);
        continue;
      }
      rules.push(...collected);
      logger.debug(`Loaded ${String(collected.length)} rule(s) from plugin "${pluginPath}"`);
    } catch (err) {
      logger.warn(`Failed to load plugin "${pluginPath}": ${String(err)}`);
    }
  }
  return rules;
}
function collectFunctions(mod) {
  const fns = [];
  if (typeof mod["default"] === "function") {
    fns.push(mod["default"]);
  }
  for (const [key, val] of Object.entries(mod)) {
    if (key !== "default" && typeof val === "function") {
      fns.push(val);
    }
  }
  return fns;
}

// src/analyser/index.ts
async function analyse(filePath, config) {
  const pluginRules = await loadPlugins(config.plugins, process.cwd());
  return _analyse(filePath, config, pluginRules);
}
async function analyseAll(filePaths, config) {
  const pluginRules = await loadPlugins(config.plugins, process.cwd());
  return Promise.all(filePaths.map((fp) => _analyse(fp, config, pluginRules)));
}
async function _analyse(filePath, config, pluginRules) {
  const parsed = parseFile(filePath);
  const issues = [];
  const usedLayers = [];
  if (config.layers.includes("structural")) {
    issues.push(...runStructuralAnalysis(parsed, config, pluginRules));
    usedLayers.push("structural");
  }
  if (config.layers.includes("semantic")) {
    const semanticIssues = await analyseSemantics(parsed.content, filePath, config);
    const filtered = semanticIssues.filter((i) => config.rules[i.ruleId] !== "off");
    issues.push(...filtered);
    usedLayers.push("semantic");
  }
  const score = calculateScore(issues);
  const { readinessScore, readinessDimensions } = computeReadiness(issues);
  return {
    file: filePath,
    score,
    grade: calculateGrade(score),
    issues,
    tokenCount: parsed.tokenCount,
    analysedAt: (/* @__PURE__ */ new Date()).toISOString(),
    layers: usedLayers,
    readinessScore,
    readinessDimensions
  };
}
async function analyseCrossFile(files, config, client) {
  if (files.length < 2) return null;
  if (!config.layers.includes("semantic")) return null;
  const issues = await multiFileSemantics(files, config, client);
  const filtered = issues.filter((i) => config.rules[i.ruleId] !== "off");
  if (filtered.length === 0) return null;
  const score = calculateScore(filtered);
  const { readinessScore, readinessDimensions } = computeReadiness(filtered);
  return {
    file: "<cross-file-analysis>",
    score,
    grade: calculateGrade(score),
    issues: filtered,
    tokenCount: 0,
    analysedAt: (/* @__PURE__ */ new Date()).toISOString(),
    layers: ["semantic"],
    readinessScore,
    readinessDimensions
  };
}
function calculateScore(issues) {
  const deductions = {
    critical: 20,
    warning: 10,
    suggestion: 3
  };
  const total = issues.reduce((acc, issue) => acc + deductions[issue.severity], 0);
  return Math.max(0, 100 - total);
}
function calculateGrade(score) {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}
var READINESS_DEDUCTIONS = {
  "unobservable-outcome": { observable: 25 },
  "missing-success-criteria": { observable: 20, bounded: 10 },
  "vague-boundary": { bounded: 15 },
  "missing-fallback": { bounded: 20 },
  "scope-bleed": { bounded: 20 },
  "hardcoded-environment": { bounded: 15 },
  "missing-recovery-strategy": { reversible: 25 },
  "over-permissive": { reversible: 20 },
  "missing-tool-list": { tooled: 20 },
  "tool-mismatch": { tooled: 25 },
  "todo-in-instructions": { documented: 20 },
  "empty-section": { documented: 10 },
  "ambiguous-pronoun": { documented: 10 },
  "cross-file-conflict": { bounded: 15, documented: 10 }
};
function computeReadiness(issues) {
  const dims = {
    observable: 100,
    bounded: 100,
    reversible: 100,
    tooled: 100,
    documented: 100
  };
  for (const issue of issues) {
    const deductions = READINESS_DEDUCTIONS[issue.ruleId];
    if (!deductions) continue;
    for (const [dim, amount] of Object.entries(deductions)) {
      dims[dim] = Math.max(0, dims[dim] - amount);
    }
  }
  const readinessScore = Math.round(
    (dims.observable + dims.bounded + dims.reversible + dims.tooled + dims.documented) / 5
  );
  return { readinessScore, readinessDimensions: dims };
}

export {
  logger,
  analyse,
  analyseAll,
  analyseCrossFile,
  calculateScore,
  calculateGrade,
  computeReadiness
};
//# sourceMappingURL=chunk-S267EHLT.js.map