#!/usr/bin/env node
import {
  analyse,
  analyseAll,
  analyseCrossFile,
  calculateGrade,
  calculateScore,
  computeReadiness,
  logger
} from "./chunk-S267EHLT.js";
import {
  parseFile,
  parseMarkdownContent,
  parseMdcContent
} from "./chunk-XTBU7AIN.js";
import {
  runStructuralAnalysis
} from "./chunk-RXZSUZDW.js";
import "./chunk-N25LFLMI.js";

// src/cli.ts
import chalk7 from "chalk";
import { Command } from "commander";
import { resolve as resolve5, relative as relative3, dirname as dirname2, join as join2, basename as basename4, extname as extname2 } from "path";
import { existsSync as existsSync3, watch as fsWatch } from "fs";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

// src/config.ts
import { readFileSync } from "fs";
import { resolve } from "path";

// src/types.ts
var DEFAULT_CONFIG = {
  model: "claude-sonnet-4-6",
  layers: ["structural", "semantic"],
  rules: {},
  tokenBudgetWarning: 500,
  ignore: [],
  failOn: "critical",
  plugins: []
};

// src/config.ts
function loadConfig(cwd = process.cwd()) {
  const configPath = resolve(cwd, ".agentdoctor.json");
  try {
    const raw = readFileSync(configPath, "utf8");
    const partial = JSON.parse(raw);
    logger.debug(`Loaded config from ${configPath}`);
    return {
      ...DEFAULT_CONFIG,
      ...partial,
      // Deep merge rules so partial overrides don't wipe the whole map
      rules: { ...DEFAULT_CONFIG.rules, ...partial.rules ?? {} }
    };
  } catch (err) {
    const isNotFound = err instanceof Error && "code" in err && err.code === "ENOENT";
    if (!isNotFound) {
      logger.warn(`Failed to read .agentdoctor.json: ${String(err)}`);
    }
    return { ...DEFAULT_CONFIG };
  }
}

// src/discovery.ts
import { existsSync, readdirSync } from "fs";
import { resolve as resolve2, join } from "path";
var WELL_KNOWN_FILES = [
  "CLAUDE.md",
  "AGENTS.md",
  "GEMINI.md",
  ".github/copilot-instructions.md",
  ".cursorrules",
  ".windsurfrules"
];
var SCANNED_DIRS = [
  { dir: ".cursor/rules", ext: ".mdc" },
  { dir: ".claude/agents", ext: ".md" },
  { dir: ".claude/commands", ext: ".md" },
  { dir: ".roo/rules", ext: ".md" }
];
function discoverFiles(cwd = process.cwd()) {
  const files = [];
  for (const candidate of WELL_KNOWN_FILES) {
    const full = resolve2(cwd, candidate);
    if (existsSync(full)) files.push(full);
  }
  for (const { dir, ext } of SCANNED_DIRS) {
    const full = resolve2(cwd, dir);
    if (!existsSync(full)) continue;
    try {
      for (const entry of readdirSync(full)) {
        if (entry.endsWith(ext)) {
          files.push(resolve2(full, entry));
        }
      }
    } catch {
    }
  }
  return files;
}
var SKIP_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".turbo",
  "vendor"
]);
function discoverOrgFiles(root = process.cwd(), maxDepth = 4) {
  const found = /* @__PURE__ */ new Set();
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    for (const candidate of WELL_KNOWN_FILES) {
      const full = resolve2(dir, candidate);
      if (existsSync(full)) found.add(full);
    }
    for (const { dir: subDir, ext } of SCANNED_DIRS) {
      const full = resolve2(dir, subDir);
      if (!existsSync(full)) continue;
      try {
        for (const entry of readdirSync(full)) {
          if (entry.endsWith(ext)) found.add(resolve2(full, entry));
        }
      } catch {
      }
    }
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          walk(join(dir, entry.name), depth + 1);
        }
      }
    } catch {
    }
  }
  walk(root, 0);
  return Array.from(found);
}

// src/fixer.ts
import { readFileSync as readFileSync2, writeFileSync } from "fs";
var AUTO_FIXABLE = /* @__PURE__ */ new Set([
  "todo-in-instructions",
  "unclosed-code-block",
  "empty-section",
  "missing-success-criteria"
]);
var TODO_RE = /\b(TODO|FIXME|HACK|PLACEHOLDER|XXX|TBD)\b/;
async function applyFixes(filePath, issues, options) {
  const dryRun = options?.dryRun ?? false;
  const fixedSet = /* @__PURE__ */ new Set();
  const skippedSet = /* @__PURE__ */ new Set();
  let content = readFileSync2(filePath, "utf8");
  const original = content;
  for (const issue of issues) {
    if (!AUTO_FIXABLE.has(issue.ruleId)) {
      skippedSet.add(issue.ruleId);
    }
  }
  const hasTodo = issues.some((i) => i.ruleId === "todo-in-instructions");
  if (hasTodo) {
    const lines = content.split("\n");
    let changed = false;
    const cleaned = lines.map((line) => {
      if (TODO_RE.test(line)) {
        changed = true;
        return `<!-- TODO removed by agent-doctor \u2014 replace with actual instruction -->`;
      }
      return line;
    });
    if (changed) {
      content = cleaned.join("\n");
      fixedSet.add("todo-in-instructions");
    }
  }
  const hasUnclosed = issues.some((i) => i.ruleId === "unclosed-code-block");
  if (hasUnclosed) {
    if (!content.endsWith("\n")) content += "\n";
    content += "```\n";
    fixedSet.add("unclosed-code-block");
  }
  const emptyIssues = issues.filter(
    (i) => i.ruleId === "empty-section" && i.line !== void 0
  );
  if (emptyIssues.length > 0) {
    const lines = content.split("\n");
    const sortedDesc = [...emptyIssues].sort((a, b) => b.line - a.line);
    for (const issue of sortedDesc) {
      const idx = issue.line - 1;
      lines.splice(idx + 1, 0, "", "_No content yet \u2014 add instructions here._");
    }
    content = lines.join("\n");
    fixedSet.add("empty-section");
  }
  const successIssues = issues.filter(
    (i) => i.ruleId === "missing-success-criteria" && i.line !== void 0
  );
  if (successIssues.length > 0) {
    const lines = content.split("\n");
    const HEADING_RE = /^#{1,6}\s/;
    const PLACEHOLDER = '> \u2705 **Success criteria:** Done when _<describe the expected outcome \u2014 e.g. "all tests pass", "the feature works as expected">_';
    const sortedDesc = [...successIssues].sort((a, b) => b.line - a.line);
    for (const issue of sortedDesc) {
      const headingIdx = issue.line - 1;
      let insertIdx = lines.length;
      for (let i = headingIdx + 1; i < lines.length; i++) {
        if (HEADING_RE.test(lines[i] ?? "")) {
          insertIdx = i;
          break;
        }
      }
      lines.splice(insertIdx, 0, "", PLACEHOLDER, "");
    }
    content = lines.join("\n");
    fixedSet.add("missing-success-criteria");
  }
  if (!dryRun && content !== original) {
    writeFileSync(filePath, content, "utf8");
  }
  return {
    fixed: [...fixedSet],
    skipped: [...skippedSet],
    ...dryRun ? { preview: content } : {}
  };
}

// src/init.ts
import { writeFileSync as writeFileSync2, mkdirSync, existsSync as existsSync2 } from "fs";
import { resolve as resolve3 } from "path";
import { createInterface } from "readline";
var CLAUDE_TEMPLATE = `# Project Name \u2014 CLAUDE.md

> Agent instruction file generated by **agent-doctor**.
> Replace every \`[placeholder]\` before use.
> Validate: \`npx @chiragdarji/agent-doctor CLAUDE.md\`

## Project Overview

[One-paragraph description of what this project does and its main purpose.]

**Tech stack:** [e.g. TypeScript \xB7 Node.js \xB7 React]

**Repository layout:** [brief directory summary]

## Workflow

Each task follows this sequence:

1. Read the requirements and clarify any ambiguities before starting.
2. Identify which files need to change.
3. Make the minimal change that satisfies the requirement.
4. Run the test suite and linter to confirm correctness.
5. Summarise what changed and why in the commit message.

> \u2705 **Success criteria:** A task is complete when all tests pass, the linter is clean, and the feature works end-to-end.

## Available Tools

The following tools and commands are available in this project:

| Command | Purpose |
|---------|---------|
| \`[test-command]\` | Run the full test suite |
| \`[build-command]\` | Compile / bundle the project |
| \`[lint-command]\` | Run the linter |
| \`[format-command]\` | Auto-format source files |

## Coding Standards

Write code that follows these standards:

- Use [language] strict mode throughout the codebase.
- Prefer named exports over default exports.
- Keep functions focused \u2014 one responsibility per function.
- Handle errors explicitly; do not swallow exceptions.
- Keep code readable without comments.

> \u2705 **Success criteria:** Code is ready when it compiles without errors and all existing tests remain green.

## What NOT To Do

These actions are explicitly prohibited:

- Do not introduce breaking API changes without explicit approval.
- Do not commit secrets, credentials, or environment-specific values.
- Do not skip the test suite when fixing bugs.

Each prohibition has a preferred alternative \u2014 ask if unclear.

## Environment

Project runs on [OS / platform]. Key dependencies:

\`\`\`bash
# Install dependencies
[install-command]

# Verify setup
[verify-command]
\`\`\`

Avoid hardcoding machine-specific paths. Use environment variables or relative paths instead.
`;
var CURSOR_MDC_TEMPLATE = `---
description: "[Describe what these rules govern \u2014 e.g. TypeScript React component authoring]"
alwaysApply: true
---

# [Project] \u2014 Cursor Rules

> Generated by **agent-doctor**. Replace every \`[placeholder]\` before use.
> Validate: \`npx @chiragdarji/agent-doctor .cursor/rules/main.mdc\`

## Project Overview

[One-paragraph description of the project and its main purpose.]

**Tech stack:** [e.g. TypeScript \xB7 React \xB7 Tailwind CSS]

## Workflow

Each task follows this sequence:

1. Read the requirements and identify affected files.
2. Make the minimal change that satisfies the requirement.
3. Run tests and linting to confirm correctness.
4. Summarise what changed and why.

> \u2705 **Success criteria:** A task is complete when tests pass, linting is clean, and the feature works as described.

## Coding Standards

- Follow [language] conventions and the project style guide.
- Keep functions focused \u2014 one responsibility per function.
- Handle errors explicitly; do not swallow exceptions.
- Prefer readable code over clever code.

## What NOT To Do

- Do not introduce breaking changes without explicit approval.
- Do not commit environment-specific secrets or absolute paths.

Each prohibition has a preferred alternative \u2014 ask if unclear.

## Environment

Project runs on [OS / platform]. Avoid hardcoding machine-specific paths; use relative paths or environment variables instead.
`;
var AGENTS_TEMPLATE = `# Project Name \u2014 AGENTS.md

> Agent instruction file generated by **agent-doctor**.
> Replace every \`[placeholder]\` before use.
> Validate: \`npx @chiragdarji/agent-doctor AGENTS.md\`

## Project Overview

[One-paragraph description of what this project does and its main purpose.]

**Tech stack:** [e.g. Python \xB7 FastAPI \xB7 PostgreSQL]

**Repository layout:** [brief directory summary]

## Workflow

Each task follows this sequence:

1. Read the requirements and clarify any ambiguities before starting.
2. Identify which files need to change.
3. Make the minimal change that satisfies the requirement.
4. Run the test suite and linter to confirm correctness.
5. Summarise what changed and why in the commit message.

> \u2705 **Success criteria:** A task is complete when all tests pass, the linter is clean, and the feature works end-to-end.

## Available Tools

The following tools and commands are available in this project:

| Command | Purpose |
|---------|---------|
| \`[test-command]\` | Run the full test suite |
| \`[build-command]\` | Build the project |
| \`[lint-command]\` | Run the linter |

## Coding Standards

Write code that follows these standards:

- Follow [language] conventions and the project style guide.
- Keep functions focused \u2014 one responsibility per function.
- Handle errors explicitly; do not swallow exceptions.
- Keep code readable without comments.

> \u2705 **Success criteria:** Code is ready when it passes lint checks and all tests remain green.

## What NOT To Do

These actions are explicitly prohibited:

- Do not introduce breaking API changes without explicit approval.
- Do not commit secrets, credentials, or environment-specific values.
- Do not skip the test suite when fixing bugs.

Each prohibition has a preferred alternative \u2014 ask if unclear.

## Environment

Project runs on [OS / platform]. Key dependencies:

\`\`\`bash
# Install dependencies
[install-command]

# Verify setup
[verify-command]
\`\`\`

Avoid hardcoding machine-specific paths. Use environment variables or relative paths instead.
`;
function targetFor(type, cwd) {
  switch (type) {
    case "claude":
      return { path: resolve3(cwd, "CLAUDE.md") };
    case "agents":
      return { path: resolve3(cwd, "AGENTS.md") };
    case "cursor":
      return {
        path: resolve3(cwd, ".cursor", "rules", "main.mdc"),
        dir: resolve3(cwd, ".cursor", "rules")
      };
  }
}
function templateFor(type) {
  switch (type) {
    case "claude":
      return CLAUDE_TEMPLATE;
    case "agents":
      return AGENTS_TEMPLATE;
    case "cursor":
      return CURSOR_MDC_TEMPLATE;
  }
}
async function promptOverwrite(filePath) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => {
    rl.question(`File already exists: ${filePath}
Overwrite? [y/N] `, (answer) => {
      rl.close();
      res(answer.trim().toLowerCase() === "y");
    });
  });
}
async function initFile(opts) {
  const { path: filePath, dir } = targetFor(opts.type, opts.cwd);
  const existed = existsSync2(filePath);
  if (existed && !opts.force) {
    const confirmed = await promptOverwrite(filePath);
    if (!confirmed) {
      throw new Error(`Aborted \u2014 ${filePath} already exists. Use --force to overwrite.`);
    }
  }
  if (dir !== void 0) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync2(filePath, templateFor(opts.type), "utf8");
  return { filePath, type: opts.type, existed };
}

// src/output/formatter.ts
import chalk from "chalk";
import { basename } from "path";
var SEPARATOR = chalk.dim("\u2500".repeat(44));
var SEVERITY_ICON = {
  critical: "\u274C",
  warning: "\u26A0 ",
  suggestion: "\u{1F4A1}"
};
var SEVERITY_LABEL = {
  critical: "CRITICAL",
  warning: "WARNING ",
  suggestion: "SUGGEST "
};
function severityColour(severity) {
  switch (severity) {
    case "critical":
      return chalk.red.bold;
    case "warning":
      return chalk.yellow.bold;
    case "suggestion":
      return chalk.cyan.bold;
  }
}
function gradeColour(grade) {
  switch (grade) {
    case "A":
      return chalk.green.bold;
    case "B":
      return chalk.greenBright.bold;
    case "C":
      return chalk.yellow.bold;
    case "D":
      return chalk.red;
    case "F":
      return chalk.red.bold;
  }
}
function scoreColour(score) {
  if (score >= 90) return chalk.green.bold;
  if (score >= 75) return chalk.greenBright.bold;
  if (score >= 60) return chalk.yellow.bold;
  if (score >= 40) return chalk.red;
  return chalk.red.bold;
}
function formatIssue(issue) {
  const colour = severityColour(issue.severity);
  const icon = SEVERITY_ICON[issue.severity];
  const label = SEVERITY_LABEL[issue.severity];
  const header = colour(`${icon}  ${label}  ${issue.ruleId}`);
  const loc = issue.line !== void 0 ? chalk.dim(` (line ${issue.line})`) : "";
  const message = `    ${issue.message}${loc}`;
  const suggestion = chalk.green(`    \u2192 ${issue.suggestion}`);
  const parts = [header, message, suggestion];
  if (issue.context !== void 0 && issue.context !== issue.message) {
    parts.splice(1, 0, chalk.dim(`    "${issue.context}"`));
  }
  return parts.join("\n");
}
function formatResult(result) {
  const lines = [];
  const file = basename(result.file);
  lines.push("");
  lines.push(chalk.bold(`agent-doctor \u{1FA7A}  Analysing ${file}...`));
  lines.push("");
  if (result.issues.length === 0) {
    lines.push(chalk.green.bold("\u2713  No issues found"));
  } else {
    const ordered = ["critical", "warning", "suggestion"];
    for (const sev of ordered) {
      const group = result.issues.filter((i) => i.severity === sev);
      for (const issue of group) {
        lines.push(formatIssue(issue));
        lines.push("");
      }
    }
  }
  const criticals = result.issues.filter((i) => i.severity === "critical").length;
  const warnings = result.issues.filter((i) => i.severity === "warning").length;
  const suggestions = result.issues.filter((i) => i.severity === "suggestion").length;
  const issueParts = [];
  if (criticals > 0) issueParts.push(chalk.red.bold(`${criticals} critical`));
  if (warnings > 0) issueParts.push(chalk.yellow(`${warnings} warning${warnings > 1 ? "s" : ""}`));
  if (suggestions > 0)
    issueParts.push(chalk.cyan(`${suggestions} suggestion${suggestions > 1 ? "s" : ""}`));
  const issueSummary = issueParts.length > 0 ? issueParts.join(chalk.dim(" \xB7 ")) : "none";
  const scoreStr = scoreColour(result.score)(`${result.score} / 100`);
  const gradeStr = gradeColour(result.grade)(result.grade);
  const { readinessScore, readinessDimensions: rd } = result;
  const readinessStr = scoreColour(readinessScore)(`${readinessScore} / 100`);
  const dimStr = [
    `obs ${rd.observable}`,
    `bnd ${rd.bounded}`,
    `rev ${rd.reversible}`,
    `tld ${rd.tooled}`,
    `doc ${rd.documented}`
  ].map((d) => chalk.dim(d)).join(chalk.dim(" \xB7 "));
  lines.push(SEPARATOR);
  lines.push(`Health Score   ${scoreStr}  (${gradeStr})`);
  lines.push(`Readiness      ${readinessStr}  ${dimStr}`);
  lines.push(`Issues         ${issueSummary}`);
  lines.push(`Files          ${result.file}`);
  if (result.layers.includes("semantic")) {
    lines.push(`Model          ${process.env["AGENT_DOCTOR_MODEL"] ?? "claude-sonnet-4-6"}`);
  }
  lines.push(SEPARATOR);
  return lines.join("\n");
}
function formatResults(results) {
  return results.map(formatResult).join("\n");
}
function formatResultJson(result) {
  return JSON.stringify(result, null, 2);
}
function formatResultsJson(results) {
  return JSON.stringify(results, null, 2);
}

// src/output/readiness-reporter.ts
import chalk2 from "chalk";
import { basename as basename2 } from "path";
var BAR_WIDTH = 20;
var PASS_THRESHOLD = 85;
var WARN_THRESHOLD = 60;
var SEP = chalk2.dim("\u2500".repeat(56));
var DOUBLE_SEP = chalk2.dim("\u2550".repeat(56));
var DIMENSIONS = [
  {
    key: "observable",
    label: "Observable",
    passMsg: "All task outcomes have measurable completion signals.",
    failMsg: "Some tasks lack verifiable success criteria \u2014 the agent cannot confirm completion."
  },
  {
    key: "bounded",
    label: "Bounded",
    passMsg: "Scope and task boundaries are well-defined.",
    failMsg: "Scope or task boundaries are unclear \u2014 the agent may over- or under-reach."
  },
  {
    key: "reversible",
    label: "Reversible",
    passMsg: "Risky operations are guarded with recovery guidance.",
    failMsg: "Destructive operations lack rollback steps \u2014 failures may be unrecoverable."
  },
  {
    key: "tooled",
    label: "Tooled",
    passMsg: "Available tools are enumerated and correctly described.",
    failMsg: "Tool inventory is incomplete or contains inaccurate descriptions."
  },
  {
    key: "documented",
    label: "Documented",
    passMsg: "Instructions provide sufficient context for autonomous decisions.",
    failMsg: "Context gaps may force the agent to make uninformed assumptions."
  }
];
var DIMENSION_RULES = {
  observable: ["unobservable-outcome", "missing-success-criteria"],
  bounded: [
    "vague-boundary",
    "missing-fallback",
    "scope-bleed",
    "hardcoded-environment",
    "missing-success-criteria",
    "cross-file-conflict"
  ],
  reversible: ["missing-recovery-strategy", "over-permissive"],
  tooled: ["missing-tool-list", "tool-mismatch"],
  documented: ["todo-in-instructions", "empty-section", "ambiguous-pronoun", "cross-file-conflict"]
};
function dimColour(score) {
  if (score >= PASS_THRESHOLD) return chalk2.green.bold;
  if (score >= WARN_THRESHOLD) return chalk2.yellow.bold;
  return chalk2.red.bold;
}
function bar(score) {
  const filled = Math.round(score / 100 * BAR_WIDTH);
  return chalk2.green("\u2588".repeat(filled)) + chalk2.dim("\u2591".repeat(BAR_WIDTH - filled));
}
function issueBlock(issue) {
  const icon = issue.severity === "critical" ? chalk2.red("\u25CF") : chalk2.yellow("\u25CF");
  const loc = issue.line !== void 0 ? chalk2.dim(` line ${issue.line}`) : "";
  return [
    `  ${icon}  ${chalk2.bold(`[${issue.ruleId}]`)}${loc}`,
    `      ${issue.message}`,
    `      ${chalk2.green("\u2192")} ${issue.suggestion}`
  ].join("\n");
}
function formatReadinessReport(results) {
  if (results.length === 0) return "";
  const parts = results.map(reportForResult);
  if (results.length > 1) {
    parts.push(aggregateSection(results));
  }
  return parts.join("\n");
}
function reportForResult(result) {
  const lines = [];
  const rd = result.readinessDimensions;
  const isCrossFile = result.file === "<cross-file-analysis>";
  const fileLabel = isCrossFile ? "cross-file analysis" : basename2(result.file);
  lines.push("");
  lines.push(chalk2.bold.underline(`Agent Readiness Report  \u2014  ${fileLabel}`));
  lines.push(
    `Overall Readiness  ${dimColour(result.readinessScore)(`${result.readinessScore} / 100`)}  ` + chalk2.dim(`(Health: ${result.score}/100  Grade: ${result.grade})`)
  );
  lines.push("");
  for (const { key, label } of DIMENSIONS) {
    const score = rd[key];
    const icon = score >= PASS_THRESHOLD ? chalk2.green("\u2713") : chalk2.yellow("\u26A0");
    const scoreStr = dimColour(score)(`${String(score).padStart(3)}/100`);
    lines.push(`  ${icon}  ${chalk2.bold(label.padEnd(12))}  ${scoreStr}  ${bar(score)}`);
  }
  lines.push("");
  for (const { key, label, passMsg, failMsg } of DIMENSIONS) {
    const score = rd[key];
    lines.push(SEP);
    lines.push(dimColour(score)(`${label}  ${score}/100`));
    if (score >= PASS_THRESHOLD) {
      lines.push(chalk2.green(`\u2713  ${passMsg}`));
    } else {
      lines.push(chalk2.yellow(`\u26A0  ${failMsg}`));
      const relevant = result.issues.filter((i) => DIMENSION_RULES[key].includes(i.ruleId));
      if (relevant.length > 0) {
        lines.push("");
        lines.push(...relevant.map(issueBlock));
      } else {
        lines.push(chalk2.dim("  (No active issues in this dimension.)"));
      }
    }
    lines.push("");
  }
  lines.push(SEP);
  return lines.join("\n");
}
function aggregateSection(results) {
  const lines = [];
  const avg = (key) => Math.round(results.reduce((s, r) => s + r.readinessDimensions[key], 0) / results.length);
  const avgReadiness = Math.round(
    results.reduce((s, r) => s + r.readinessScore, 0) / results.length
  );
  lines.push(DOUBLE_SEP);
  lines.push(chalk2.bold(`Aggregate Readiness \u2014 ${results.length} files`));
  lines.push(`Overall  ${dimColour(avgReadiness)(`${avgReadiness} / 100`)}`);
  lines.push("");
  for (const { key, label } of DIMENSIONS) {
    const score = avg(key);
    lines.push(
      `  ${dimColour(score)(label.padEnd(12))}  ${dimColour(score)(`${String(score).padStart(3)}/100`)}  ${bar(score)}`
    );
  }
  lines.push(DOUBLE_SEP);
  return lines.join("\n");
}

// src/output/org-reporter.ts
import chalk4 from "chalk";
import { basename as basename3, relative } from "path";

// src/output/colours.ts
import chalk3 from "chalk";
var DIM_KEYS = [
  "observable",
  "bounded",
  "reversible",
  "tooled",
  "documented"
];
function avgNums(nums) {
  if (nums.length === 0) return 100;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}
function avgDimensions(results) {
  const dims = { observable: 100, bounded: 100, reversible: 100, tooled: 100, documented: 100 };
  for (const key of DIM_KEYS) {
    dims[key] = avgNums(results.map((r) => r.readinessDimensions[key]));
  }
  return dims;
}
function gradeColour2(grade) {
  if (grade === "A") return chalk3.green(grade);
  if (grade === "B") return chalk3.cyan(grade);
  if (grade === "C") return chalk3.yellow(grade);
  if (grade === "D") return chalk3.red(grade);
  return chalk3.red.bold(grade);
}
function scoreColour2(score, text) {
  const s = text ?? String(score);
  if (score >= 85) return chalk3.green(s);
  if (score >= 60) return chalk3.yellow(s);
  return chalk3.red(s);
}

// src/output/org-reporter.ts
function gradeCount(grade, count) {
  if (count === 0) return chalk4.dim("0");
  if (grade === "A") return chalk4.green(String(count));
  if (grade === "B") return chalk4.cyan(String(count));
  if (grade === "C") return chalk4.yellow(String(count));
  return chalk4.red(String(count));
}
function scoreBar(score, width = 20) {
  const filled = Math.round(score / 100 * width);
  const bar2 = "\u2588".repeat(filled) + "\u2591".repeat(width - filled);
  if (score >= 85) return chalk4.green(bar2);
  if (score >= 60) return chalk4.yellow(bar2);
  return chalk4.red(bar2);
}
function fileTypeLabel(filePath) {
  const base = basename3(filePath);
  if (/^claude\.md$/i.test(base)) return "CLAUDE.md";
  if (/^agents\.md$/i.test(base)) return "AGENTS.md";
  if (/^gemini\.md$/i.test(base)) return "GEMINI.md";
  if (base.endsWith(".mdc")) return ".mdc";
  if (base === "copilot-instructions.md") return "copilot-instructions.md";
  if (/^\.windsurfrules$/i.test(base)) return ".windsurfrules";
  if (base.endsWith(".md") && filePath.includes(".roo/rules/")) return ".roo rule";
  return base;
}
function groupByType(results) {
  const map = /* @__PURE__ */ new Map();
  for (const r of results) {
    const label = fileTypeLabel(r.file);
    const group = map.get(label) ?? [];
    group.push(r);
    map.set(label, group);
  }
  return Array.from(map.entries()).map(([label, res]) => {
    const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const r of res) grades[r.grade]++;
    return {
      label,
      results: res,
      avgScore: avgNums(res.map((r) => r.score)),
      avgReadiness: avgNums(res.map((r) => r.readinessScore)),
      avgDims: avgDimensions(res),
      grades
    };
  });
}
function formatDimensionRow(label, score) {
  const padded = label.padEnd(12);
  const num = String(score).padStart(3);
  return `  ${chalk4.dim(padded)} ${scoreBar(score, 12)} ${num}`;
}
function formatOrgReport(results, root) {
  if (results.length === 0) {
    return chalk4.yellow("No agent instruction files found in this workspace.");
  }
  const lines = [];
  lines.push("");
  lines.push(chalk4.bold(`Org Health Dashboard \u2014 ${relative(process.cwd(), root) || "."}`));
  lines.push(chalk4.dim(`${results.length} file${results.length !== 1 ? "s" : ""} analysed`));
  lines.push("");
  const groups = groupByType(results);
  lines.push(
    chalk4.dim(
      `${"TYPE".padEnd(26)}${"FILES".padStart(6)}  ${"AVG SCORE".padEnd(10)}${"AVG RDNS".padEnd(10)}${"A".padStart(3)}${"B".padStart(3)}${"C".padStart(3)}${"D".padStart(3)}${"F".padStart(3)}`
    )
  );
  lines.push(chalk4.dim("\u2500".repeat(72)));
  for (const g of groups) {
    const scoreStr = scoreColour2(g.avgScore, String(g.avgScore).padStart(3));
    const rdnsStr = scoreColour2(g.avgReadiness, String(g.avgReadiness).padStart(3));
    lines.push(
      `${g.label.padEnd(26)}${String(g.results.length).padStart(6)}  ${scoreStr}${"".padEnd(7)}${rdnsStr}${"".padEnd(7)}${gradeCount("A", g.grades.A).padStart(3)}${gradeCount("B", g.grades.B).padStart(3)}${gradeCount("C", g.grades.C).padStart(3)}${gradeCount("D", g.grades.D).padStart(3)}${gradeCount("F", g.grades.F).padStart(3)}`
    );
  }
  lines.push("");
  const overall = {
    label: "ALL",
    results,
    avgScore: avgNums(results.map((r) => r.score)),
    avgReadiness: avgNums(results.map((r) => r.readinessScore)),
    avgDims: avgDimensions(results),
    grades: { A: 0, B: 0, C: 0, D: 0, F: 0 }
  };
  for (const r of results) overall.grades[r.grade]++;
  lines.push(chalk4.bold("Overall readiness dimensions"));
  lines.push("");
  lines.push(formatDimensionRow("Observable", overall.avgDims.observable));
  lines.push(formatDimensionRow("Bounded", overall.avgDims.bounded));
  lines.push(formatDimensionRow("Reversible", overall.avgDims.reversible));
  lines.push(formatDimensionRow("Tooled", overall.avgDims.tooled));
  lines.push(formatDimensionRow("Documented", overall.avgDims.documented));
  lines.push("");
  lines.push(
    chalk4.bold("Overall avg score: ") + scoreColour2(overall.avgScore) + chalk4.dim("  |  ") + chalk4.bold("Avg readiness: ") + scoreColour2(overall.avgReadiness)
  );
  lines.push("");
  lines.push(chalk4.bold("Files"));
  lines.push("");
  for (const r of results) {
    const rel = relative(root, r.file) || basename3(r.file);
    const scoreStr = scoreColour2(r.score, String(r.score).padStart(3));
    const issueStr = r.issues.length === 0 ? chalk4.green("\u2713") : chalk4.yellow(`${r.issues.length} issue${r.issues.length !== 1 ? "s" : ""}`);
    lines.push(`  ${scoreStr}  ${chalk4.dim(r.grade)}  ${issueStr.padEnd(10)}  ${rel}`);
  }
  lines.push("");
  return lines.join("\n");
}
function formatOrgReportJson(results, root) {
  const groups = groupByType(results);
  const allDims = avgDimensions(results);
  return JSON.stringify(
    {
      root,
      fileCount: results.length,
      avgScore: avgNums(results.map((r) => r.score)),
      avgReadiness: avgNums(results.map((r) => r.readinessScore)),
      avgDimensions: allDims,
      byType: groups.map((g) => ({
        type: g.label,
        count: g.results.length,
        avgScore: g.avgScore,
        avgReadiness: g.avgReadiness,
        avgDimensions: g.avgDims,
        grades: g.grades
      })),
      files: results.map((r) => ({
        file: relative(root, r.file) || basename3(r.file),
        score: r.score,
        grade: r.grade,
        readinessScore: r.readinessScore,
        issueCount: r.issues.length
      }))
    },
    null,
    2
  );
}

// src/analyser/history.ts
import { execFileSync } from "child_process";
import { extname, dirname, relative as relative2, resolve as resolve4 } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
var execFileAsync = promisify(execFile);
async function runHistory(filePath, config, n = 10) {
  const absPath = resolve4(process.cwd(), filePath);
  const fileDir = dirname(absPath);
  let gitRoot;
  try {
    gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      cwd: fileDir
    }).trim();
  } catch {
    throw new Error("Not a git repository \u2014 --history requires git");
  }
  const gitRelPath = relative2(gitRoot, absPath);
  let logOutput;
  try {
    logOutput = execFileSync(
      "git",
      ["log", "--format=%H|%ai|%s", `-n`, String(n), "--", gitRelPath],
      { encoding: "utf8", cwd: gitRoot }
    ).trim();
  } catch {
    throw new Error(`Failed to read git log for ${filePath}`);
  }
  if (!logOutput) return [];
  const commits = [];
  for (const line of logOutput.split("\n")) {
    if (!line.trim()) continue;
    const pipeIdx = line.indexOf("|");
    const pipe2Idx = line.indexOf("|", pipeIdx + 1);
    if (pipeIdx < 0 || pipe2Idx < 0) continue;
    commits.push({
      hash: line.slice(0, pipeIdx),
      date: (line.slice(pipeIdx + 1, pipe2Idx).split(" ")[0] ?? "").trim(),
      subject: line.slice(pipe2Idx + 1).trim()
    });
  }
  const contents = await Promise.all(
    commits.map(
      ({ hash }) => execFileAsync("git", ["show", `${hash}:${gitRelPath}`], {
        encoding: "utf8",
        cwd: gitRoot
      }).then(({ stdout }) => stdout).catch(() => null)
    )
  );
  const isMdc = extname(filePath).toLowerCase() === ".mdc";
  const structuralConfig = { ...config, layers: ["structural"] };
  const entries = [];
  for (let i = 0; i < commits.length; i++) {
    const rawContent = contents[i];
    if (rawContent == null) continue;
    const { hash, date, subject } = commits[i];
    const parsed = isMdc ? parseMdcContent(filePath, rawContent) : parseMarkdownContent(filePath, rawContent);
    const issues = runStructuralAnalysis(parsed, structuralConfig, []);
    const score = calculateScore(issues);
    const { readinessScore } = computeReadiness(issues);
    let criticalCount = 0;
    let warningCount = 0;
    for (const issue of issues) {
      if (issue.severity === "critical") criticalCount++;
      else if (issue.severity === "warning") warningCount++;
    }
    entries.push({
      commit: hash.slice(0, 7),
      date,
      subject,
      score,
      grade: calculateGrade(score),
      issueCount: issues.length,
      criticalCount,
      warningCount,
      readinessScore
    });
  }
  return entries;
}

// src/output/history-reporter.ts
import chalk5 from "chalk";
function scoreTrend(entries) {
  if (entries.length < 2) return "";
  const first = entries[entries.length - 1].score;
  const last = entries[0].score;
  const delta = last - first;
  if (delta > 0) return chalk5.green(` \u2191${delta}`);
  if (delta < 0) return chalk5.red(` \u2193${Math.abs(delta)}`);
  return chalk5.dim(" \u21920");
}
function formatHistory(entries, filePath) {
  if (entries.length === 0) {
    return chalk5.yellow(`No git history found for ${filePath}`);
  }
  const lines = [];
  lines.push("");
  lines.push(chalk5.bold(`Score history \u2014 ${filePath}`) + scoreTrend(entries));
  lines.push("");
  const COL = {
    commit: 7,
    date: 10,
    score: 5,
    grade: 5,
    readiness: 9,
    issues: 6,
    subject: 40
  };
  const header = [
    chalk5.dim("COMMIT ".padEnd(COL.commit + 1)),
    chalk5.dim("DATE       "),
    chalk5.dim("SCORE"),
    chalk5.dim(" GRD"),
    chalk5.dim(" RDNS"),
    chalk5.dim(" ISSUES"),
    chalk5.dim(" SUBJECT")
  ].join("");
  lines.push(header);
  lines.push(chalk5.dim("\u2500".repeat(80)));
  for (const entry of entries) {
    const scoreStr = String(entry.score).padStart(COL.score);
    const scoreColoured = scoreColour2(entry.score, scoreStr);
    const issueStr = entry.criticalCount > 0 ? chalk5.red(String(entry.issueCount).padStart(COL.issues)) : entry.warningCount > 0 ? chalk5.yellow(String(entry.issueCount).padStart(COL.issues)) : chalk5.green(String(entry.issueCount).padStart(COL.issues));
    const subjectTrunc = entry.subject.length > COL.subject ? entry.subject.slice(0, COL.subject - 1) + "\u2026" : entry.subject;
    lines.push(
      `${chalk5.dim(entry.commit)}  ${chalk5.dim(entry.date)}  ${scoreColoured}  ${gradeColour2(entry.grade)}  ${String(entry.readinessScore).padStart(4)}  ${issueStr}  ${chalk5.dim(subjectTrunc)}`
    );
  }
  lines.push("");
  lines.push(
    chalk5.dim(
      `${entries.length} commit${entries.length !== 1 ? "s" : ""} \xB7 structural analysis only`
    )
  );
  lines.push("");
  return lines.join("\n");
}
function formatHistoryJson(entries, filePath) {
  return JSON.stringify({ file: filePath, history: entries }, null, 2);
}

// src/output/compare-reporter.ts
import chalk6 from "chalk";
function issueKey(issue) {
  return `${issue.ruleId}:${issue.line ?? 0}`;
}
function formatCompare(before, after, beforeLabel, afterLabel) {
  const lines = [];
  const scoreDelta = after.score - before.score;
  const rdnsDelta = after.readinessScore - before.readinessScore;
  const deltaStr = (d) => d > 0 ? chalk6.green(`\u2191${d}`) : d < 0 ? chalk6.red(`\u2193${Math.abs(d)}`) : chalk6.dim("\u21920");
  lines.push("");
  lines.push(chalk6.bold(`Compare: ${beforeLabel}  \u2192  ${afterLabel}`));
  lines.push("");
  lines.push(
    `  Score:     ${scoreColour2(before.score, String(before.score).padStart(3))}  \u2192  ${scoreColour2(after.score, String(after.score).padStart(3))}  ${deltaStr(scoreDelta)}`
  );
  lines.push(`  Grade:     ${gradeColour2(before.grade)}  \u2192  ${gradeColour2(after.grade)}`);
  lines.push(
    `  Readiness: ${scoreColour2(before.readinessScore, String(before.readinessScore).padStart(3))}  \u2192  ${scoreColour2(after.readinessScore, String(after.readinessScore).padStart(3))}  ${deltaStr(rdnsDelta)}`
  );
  lines.push("");
  const beforeKeys = new Map(before.issues.map((i) => [issueKey(i), i]));
  const afterKeys = new Map(after.issues.map((i) => [issueKey(i), i]));
  const newIssues = after.issues.filter((i) => !beforeKeys.has(issueKey(i)));
  const resolved = before.issues.filter((i) => !afterKeys.has(issueKey(i)));
  const unchanged = after.issues.filter((i) => beforeKeys.has(issueKey(i)));
  if (newIssues.length > 0) {
    lines.push(chalk6.red.bold(`New issues (${newIssues.length})`));
    for (const issue of newIssues) {
      const loc = issue.line ? chalk6.dim(` line ${issue.line}`) : "";
      lines.push(`  ${chalk6.red("+")} ${chalk6.dim(issue.ruleId)}${loc}  ${issue.message}`);
    }
    lines.push("");
  }
  if (resolved.length > 0) {
    lines.push(chalk6.green.bold(`Resolved (${resolved.length})`));
    for (const issue of resolved) {
      lines.push(`  ${chalk6.green("\u2713")} ${chalk6.dim(issue.ruleId)}  ${issue.message}`);
    }
    lines.push("");
  }
  if (unchanged.length > 0) {
    lines.push(chalk6.dim(`Unchanged (${unchanged.length})`));
    for (const issue of unchanged) {
      const loc = issue.line ? chalk6.dim(` line ${issue.line}`) : "";
      lines.push(chalk6.dim(`  \xB7 ${issue.ruleId}${loc}`));
    }
    lines.push("");
  }
  if (newIssues.length === 0 && resolved.length === 0) {
    lines.push(chalk6.dim("No change in issues."));
    lines.push("");
  }
  return lines.join("\n");
}
function formatCompareJson(before, after, beforeLabel, afterLabel) {
  const beforeKeys = new Map(before.issues.map((i) => [issueKey(i), i]));
  const afterKeys = new Map(after.issues.map((i) => [issueKey(i), i]));
  return JSON.stringify(
    {
      before: {
        label: beforeLabel,
        score: before.score,
        grade: before.grade,
        readinessScore: before.readinessScore
      },
      after: {
        label: afterLabel,
        score: after.score,
        grade: after.grade,
        readinessScore: after.readinessScore
      },
      delta: {
        score: after.score - before.score,
        readinessScore: after.readinessScore - before.readinessScore
      },
      newIssues: after.issues.filter((i) => !beforeKeys.has(issueKey(i))),
      resolved: before.issues.filter((i) => !afterKeys.has(issueKey(i))),
      unchanged: after.issues.filter((i) => beforeKeys.has(issueKey(i)))
    },
    null,
    2
  );
}

// src/output/gate-reporter.ts
function severityRank(s) {
  return s === "critical" ? 3 : s === "warning" ? 2 : 1;
}
function evaluateGate(result, failOn) {
  const blockedBy = result.issues.filter(
    (i) => severityRank(i.severity) >= severityRank(failOn)
  );
  return {
    passed: blockedBy.length === 0,
    score: result.score,
    grade: result.grade,
    readinessScore: result.readinessScore,
    blockedBy,
    file: result.file
  };
}
function formatGateJson(result, failOn) {
  return JSON.stringify(evaluateGate(result, failOn), null, 2);
}
function formatOrgGateJson(results, failOn) {
  const files = results.map((r) => evaluateGate(r, failOn));
  const out = {
    passed: files.every((f) => f.passed),
    files,
    blockedFiles: files.filter((f) => !f.passed).length,
    totalFiles: files.length
  };
  return JSON.stringify(out, null, 2);
}

// src/cli.ts
var program = new Command();
program.name("agent-doctor").description("Semantic health check for AI agent instruction files").version("0.9.0");
program.argument("[file]", "Path to the instruction file to analyse").option("--all", "Discover and analyse all instruction files in the project").option("--fail-on <severity>", "Exit with code 1 if any issue meets this severity", "critical").option("--format <format>", "Output format: text or json", "text").option("--structural-only", "Skip semantic layer (no API key required)").option(
  "--model <id>",
  "Override LLM model (e.g. gpt-4o uses OPENAI_API_KEY; claude-* uses ANTHROPIC_API_KEY)"
).option("--fix", "Auto-fix structural issues in-place (todo-in-instructions, unclosed-code-block, empty-section, missing-success-criteria)").option("--dry-run", "Preview --fix changes without writing to disk").option("--watch", "Re-run analysis on every file save \u2014 Ctrl+C to stop (single file only)").option("--init", "Scaffold a new agent instruction file template in the current directory").option("--type <type>", "Template type for --init: claude | cursor | agents", "claude").option("--force", "Overwrite existing files without prompting (use with --init)").option("--readiness-report", "Print a detailed per-dimension readiness breakdown instead of the standard issue list").option("--history [n]", "Show score trend for the last n git commits (default: 10)").option("--org [dir]", "Org-level health dashboard \u2014 recursively discovers all instruction files under dir (default: cwd)").option("--compare <ref>", "Compare current file against a git ref (HEAD~1) or another file path").option("--gate", "Orchestrator gate mode \u2014 structural-only check, JSON pass/fail, exit 0=safe exit 1=blocked").option("--mcp", "Start MCP server mode (v0.2)").action(async (file, opts) => {
  if (opts.init) {
    const VALID_TYPES = ["claude", "cursor", "agents"];
    const cwd2 = process.cwd();
    let initType;
    if (VALID_TYPES.includes(opts.type)) {
      initType = opts.type;
    } else {
      process.stderr.write(`Unknown --type "${opts.type}" \u2014 valid values: claude | cursor | agents. Defaulting to claude.
`);
      initType = "claude";
    }
    try {
      const result = await initFile({ type: initType, cwd: cwd2, force: opts.force ?? false });
      const verb = result.existed ? "Overwrote" : "Created";
      const relPath = relative3(cwd2, result.filePath);
      process.stdout.write(`\u2705  ${verb} ${result.filePath}
`);
      process.stdout.write(`    Run \`npx @chiragdarji/agent-doctor ${relPath}\` to validate.
`);
    } catch (err) {
      process.stderr.write(`${String(err)}
`);
      process.exit(1);
    }
    return;
  }
  if (opts.mcp) {
    const mcpEntry = join2(dirname2(fileURLToPath(import.meta.url)), "mcp-server.js");
    const child = spawn(process.execPath, [mcpEntry], { stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }
  if (opts.compare !== void 0) {
    if (file === void 0) {
      process.stderr.write(chalk7.red("Error: --compare requires a file argument\n"));
      process.exit(2);
    }
    const cwd2 = process.cwd();
    const absFile = resolve5(cwd2, file);
    const config2 = loadConfig(cwd2);
    if (opts.model !== void 0 && opts.model.length > 0) config2.model = opts.model;
    const isFilePath = existsSync3(opts.compare);
    let beforeResult;
    let beforeLabel;
    if (isFilePath) {
      const compareConfig = { ...config2, layers: ["structural"] };
      try {
        beforeResult = await analyse(resolve5(cwd2, opts.compare), compareConfig);
      } catch (err) {
        process.stderr.write(`Error analysing ${opts.compare}: ${String(err)}
`);
        process.exit(2);
      }
      beforeLabel = opts.compare;
    } else {
      const { execFileSync: execFileSync2 } = await import("child_process");
      const fileDir = dirname2(absFile);
      let gitRoot;
      try {
        gitRoot = execFileSync2("git", ["rev-parse", "--show-toplevel"], {
          encoding: "utf8",
          cwd: fileDir
        }).trim();
      } catch {
        process.stderr.write("Error: --compare with a git ref requires a git repository\n");
        process.exit(2);
      }
      const gitRelPath = relative3(gitRoot, absFile);
      let rawContent;
      try {
        rawContent = execFileSync2("git", ["show", `${opts.compare}:${gitRelPath}`], {
          encoding: "utf8",
          cwd: gitRoot
        });
      } catch {
        process.stderr.write(`Error: could not read "${opts.compare}:${gitRelPath}" from git. Check that the ref is valid.
`);
        process.exit(2);
      }
      const { parseMarkdownContent: parseMarkdownContent2, parseMdcContent: parseMdcContent2 } = await import("./parser-4NDNFOCB.js");
      const { runStructuralAnalysis: runStructuralAnalysis2 } = await import("./structural-ULGQTOMV.js");
      const { calculateScore: calculateScore2, calculateGrade: calculateGrade2, computeReadiness: computeReadiness2 } = await import("./analyser-DHGPKPMH.js");
      const isMdc = extname2(file).toLowerCase() === ".mdc";
      const structuralConfig = { ...config2, layers: ["structural"] };
      const parsed = isMdc ? parseMdcContent2(file, rawContent) : parseMarkdownContent2(file, rawContent);
      const issues = runStructuralAnalysis2(parsed, structuralConfig, []);
      const score = calculateScore2(issues);
      const { readinessScore, readinessDimensions } = computeReadiness2(issues);
      beforeResult = {
        file: absFile,
        score,
        grade: calculateGrade2(score),
        issues,
        tokenCount: parsed.tokenCount,
        analysedAt: (/* @__PURE__ */ new Date()).toISOString(),
        layers: ["structural"],
        readinessScore,
        readinessDimensions
      };
      beforeLabel = opts.compare;
    }
    const afterConfig = { ...config2, layers: ["structural"] };
    let afterResult;
    try {
      afterResult = await analyse(absFile, afterConfig);
    } catch (err) {
      process.stderr.write(`Error analysing ${file}: ${String(err)}
`);
      process.exit(2);
    }
    if (opts.format === "json") {
      process.stdout.write(formatCompareJson(beforeResult, afterResult, beforeLabel, file) + "\n");
    } else {
      process.stdout.write(formatCompare(beforeResult, afterResult, beforeLabel, file) + "\n");
    }
    process.exit(0);
  }
  if (opts.history !== void 0) {
    if (file === void 0) {
      process.stderr.write("--history requires a file argument, e.g.: agent-doctor CLAUDE.md --history\n");
      process.exit(2);
    }
    const cwd2 = process.cwd();
    const n = typeof opts.history === "string" ? Math.max(1, parseInt(opts.history, 10) || 10) : 10;
    const config2 = loadConfig(cwd2);
    try {
      const filePath = resolve5(cwd2, file);
      const entries = await runHistory(filePath, config2, n);
      if (opts.format === "json") {
        process.stdout.write(formatHistoryJson(entries, filePath) + "\n");
      } else {
        process.stdout.write(formatHistory(entries, filePath) + "\n");
      }
    } catch (err) {
      process.stderr.write(`${String(err)}
`);
      process.exit(2);
    }
    return;
  }
  if (opts.org !== void 0) {
    const cwd2 = process.cwd();
    const orgRoot = typeof opts.org === "string" && opts.org.length > 0 ? resolve5(cwd2, opts.org) : cwd2;
    const config2 = loadConfig(cwd2);
    if (opts.model !== void 0 && opts.model.length > 0) config2.model = opts.model;
    config2.layers = ["structural"];
    if (opts.format !== "json") {
      process.stderr.write(chalk7.dim("\u2139  --org runs structural analysis only (no LLM cost)\n"));
    }
    const discovered = discoverOrgFiles(orgRoot);
    if (discovered.length === 0) {
      process.stdout.write(chalk7.yellow("No agent instruction files found.\n"));
      process.exit(0);
    }
    try {
      const results2 = await analyseAll(discovered, config2);
      if (opts.format === "json") {
        process.stdout.write(formatOrgReportJson(results2, orgRoot) + "\n");
      } else {
        process.stdout.write(formatOrgReport(results2, orgRoot) + "\n");
      }
    } catch (err) {
      process.stderr.write(`Error during org analysis: ${String(err)}
`);
      process.exit(2);
    }
    return;
  }
  const cwd = process.cwd();
  const config = loadConfig(cwd);
  if (opts.model !== void 0 && opts.model.length > 0) {
    config.model = opts.model;
  }
  if (opts.structuralOnly) {
    config.layers = ["structural"];
  }
  const VALID_SEVERITIES = ["critical", "warning", "suggestion"];
  const failOn = VALID_SEVERITIES.includes(opts.failOn) ? opts.failOn : "critical";
  config.failOn = failOn;
  let results;
  if (opts.all) {
    const discovered = discoverFiles(cwd);
    if (discovered.length === 0) {
      process.stderr.write("No agent instruction files found in this project.\n");
      process.exit(0);
    }
    try {
      results = await analyseAll(discovered, config);
    } catch (err) {
      process.stderr.write(`Error during analysis: ${String(err)}
`);
      process.exit(2);
    }
    if (discovered.length >= 2 && config.layers.includes("semantic")) {
      try {
        const fileContents = discovered.map((fp) => {
          const parsed = parseFile(fp);
          return { filePath: fp, content: parsed.content };
        });
        const crossResult = await analyseCrossFile(fileContents, config);
        if (crossResult !== null) results.push(crossResult);
      } catch (err) {
        process.stderr.write(`Cross-file analysis error: ${String(err)}
`);
      }
    }
  } else if (file !== void 0) {
    const filePath = resolve5(cwd, file);
    if (!existsSync3(filePath)) {
      process.stderr.write(`File not found: ${filePath}
`);
      process.exit(2);
    }
    try {
      results = [await analyse(filePath, config)];
    } catch (err) {
      process.stderr.write(`Error analysing ${file}: ${String(err)}
`);
      process.exit(2);
    }
  } else {
    const candidates = ["CLAUDE.md", "AGENTS.md", "GEMINI.md", ".cursorrules"];
    const found = candidates.find((c) => existsSync3(resolve5(cwd, c)));
    if (found === void 0) {
      program.help();
      process.exit(0);
    }
    try {
      results = [await analyse(resolve5(cwd, found), config)];
    } catch (err) {
      process.stderr.write(`Error analysing ${found}: ${String(err)}
`);
      process.exit(2);
    }
  }
  if (opts.gate) {
    const gateJson = results.length === 1 ? formatGateJson(results[0], failOn) : formatOrgGateJson(results, failOn);
    process.stdout.write(gateJson + "\n");
    const passed = results.length === 1 ? evaluateGate(results[0], failOn).passed : results.every((r) => evaluateGate(r, failOn).passed);
    process.exit(passed ? 0 : 1);
  }
  if (opts.format === "json") {
    process.stdout.write(
      (results.length === 1 ? formatResultJson(results[0]) : formatResultsJson(results)) + "\n"
    );
  } else if (opts.readinessReport) {
    process.stdout.write(formatReadinessReport(results) + "\n");
  } else {
    process.stdout.write(
      (results.length === 1 ? formatResult(results[0]) : formatResults(results)) + "\n"
    );
  }
  if (opts.watch) {
    const watchTarget = results[0]?.file;
    if (!watchTarget) {
      process.stderr.write("--watch requires a single file target.\n");
      process.exit(2);
    }
    if (opts.all) {
      process.stderr.write("--watch cannot be combined with --all.\n");
      process.exit(2);
    }
    process.stdout.write(`
\u{1F441}  Watching ${basename4(watchTarget)} for changes\u2026 (Ctrl+C to stop)
`);
    let debounce;
    fsWatch(watchTarget, () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        void (async () => {
          process.stdout.write(`
${"\u2500".repeat(44)}
`);
          process.stdout.write(`\u{1F504}  File changed, re-analysing\u2026
`);
          process.stdout.write(`${"\u2500".repeat(44)}
`);
          try {
            const refreshed = await analyse(watchTarget, config);
            process.stdout.write(
              opts.format === "json" ? formatResultJson(refreshed) + "\n" : opts.readinessReport ? formatReadinessReport([refreshed]) + "\n" : formatResult(refreshed) + "\n"
            );
          } catch (err) {
            process.stderr.write(`Error re-analysing: ${String(err)}
`);
          }
        })();
      }, 300);
    });
    process.stdin.resume();
    return;
  }
  if (opts.fix) {
    for (const result of results) {
      try {
        const fixResult = await applyFixes(result.file, result.issues, { dryRun: opts.dryRun ?? false });
        if (opts.dryRun && fixResult.preview !== void 0) {
          process.stdout.write(`
--- Dry-run preview: ${result.file} ---
`);
          process.stdout.write(fixResult.preview);
          process.stdout.write(`
--- End preview ---
`);
        } else if (fixResult.fixed.length > 0) {
          process.stdout.write(`\u2705  Fixed: ${fixResult.fixed.join(", ")} in ${result.file}
`);
        }
        if (fixResult.skipped.length > 0) {
          process.stdout.write(
            `\u23ED   Skipped (no auto-fix): ${fixResult.skipped.join(", ")}
`
          );
        }
        if (fixResult.fixed.length === 0 && fixResult.skipped.length === 0) {
          process.stdout.write(`\u2705  Nothing to fix in ${result.file}
`);
        }
      } catch (err) {
        process.stderr.write(`Error applying fixes to ${result.file}: ${String(err)}
`);
      }
    }
  }
  const SEVERITY_ORDER = ["suggestion", "warning", "critical"];
  const failIdx = SEVERITY_ORDER.indexOf(failOn);
  const hasFailure = results.some(
    (r) => r.issues.some((i) => SEVERITY_ORDER.indexOf(i.severity) >= failIdx)
  );
  process.exit(hasFailure ? 1 : 0);
});
program.parse();
//# sourceMappingURL=cli.js.map