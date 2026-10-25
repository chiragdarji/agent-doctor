import {
  DEFAULT_CONFIG,
  analyse,
  analyseAll,
  analyseSemantics,
  applyPlatformOverrides,
  calculateGrade,
  calculateScore,
  computeReadiness,
  countTokens,
  createAnthropicClient,
  createClientFromConfig,
  createOpenAIClient,
  createOpenAICompatibleClient,
  detectPlatform,
  inferProvider,
  loadConfig,
  loadPlugins,
  parseFile,
  parseMarkdown,
  parseMarkdownContent,
  parseMdc,
  parseMdcContent,
  parseSections,
  resolveProvider,
  runStructuralAnalysis
} from "./chunk-NIXCQA2L.js";

// src/fixer.ts
import { readFileSync, writeFileSync } from "fs";
var AUTO_FIXABLE = /* @__PURE__ */ new Set([
  "todo-in-instructions",
  "unclosed-code-block",
  "empty-section",
  "missing-success-criteria",
  "sensitive-data",
  "missing-agent-persona",
  "hardcoded-environment"
]);
var TODO_RE = /\b(TODO|FIXME|HACK|PLACEHOLDER|XXX|TBD)\b/;
var REDACT_PATTERNS = [
  /\bsk-[A-Za-z0-9]{20,}/g,
  /Bearer\s+[A-Za-z0-9\-_]{20,}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\bAKIA[A-Z0-9]{16}\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /\b(?:api[_-]?key|secret|password|passwd|token|access[_-]?key)\s*[=:]\s*["']?(?!<|YOUR|REPLACE|PLACEHOLDER|xxx|your)[A-Za-z0-9+/\-_]{16,}/gi
];
var UNIX_PATH_FIX_RE = /(?<![`'"/\w])(\/(?:home|usr|etc|var|root|opt|srv|tmp|proc|sys)\/\S+)/g;
var WIN_PATH_FIX_RE = /\b([A-Z]:\\[\w\\.\- ]+)/g;
var LOCALHOST_FIX_RE = /\blocalhost:(\d{2,5})\b/g;
async function applyFixes(filePath, issues, options) {
  const dryRun = options?.dryRun ?? false;
  const fixedSet = /* @__PURE__ */ new Set();
  const skippedSet = /* @__PURE__ */ new Set();
  let content = readFileSync(filePath, "utf8");
  const original = content;
  for (const issue of issues) {
    if (!AUTO_FIXABLE.has(issue.ruleId)) {
      skippedSet.add(issue.ruleId);
    }
  }
  if (issues.some((i) => i.ruleId === "todo-in-instructions")) {
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
  if (issues.some((i) => i.ruleId === "unclosed-code-block")) {
    if (!content.endsWith("\n")) content += "\n";
    content += "```\n";
    fixedSet.add("unclosed-code-block");
  }
  const emptyIssues = issues.filter(
    (i) => i.ruleId === "empty-section" && i.line !== void 0
  );
  if (emptyIssues.length > 0) {
    const lines = content.split("\n");
    for (const issue of [...emptyIssues].sort((a, b) => b.line - a.line)) {
      lines.splice(issue.line - 1 + 1, 0, "", "_No content yet \u2014 add instructions here._");
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
    for (const issue of [...successIssues].sort((a, b) => b.line - a.line)) {
      let insertIdx = lines.length;
      for (let i = issue.line; i < lines.length; i++) {
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
  if (issues.some((i) => i.ruleId === "sensitive-data")) {
    let redacted = content;
    for (const re of REDACT_PATTERNS) {
      re.lastIndex = 0;
      redacted = redacted.replace(re, (match) => {
        const eqIdx = match.search(/[=:]\s*["']?/);
        if (eqIdx > 0) return `${match.slice(0, eqIdx + 1)} [REDACTED]`;
        return "[REDACTED]";
      });
    }
    if (redacted !== content) {
      content = redacted;
      fixedSet.add("sensitive-data");
    }
  }
  if (issues.some((i) => i.ruleId === "missing-agent-persona")) {
    const PERSONA_STUB = "<!-- agent-doctor: update this persona statement -->\nYou are a helpful AI assistant. Describe your specific role, expertise, and constraints here.\n\n";
    const fmMatch = /^---\n[\s\S]*?\n---\n/.exec(content);
    if (fmMatch) {
      const after = fmMatch.index + fmMatch[0].length;
      content = content.slice(0, after) + PERSONA_STUB + content.slice(after);
    } else {
      content = PERSONA_STUB + content;
    }
    fixedSet.add("missing-agent-persona");
  }
  if (issues.some((i) => i.ruleId === "hardcoded-environment")) {
    let fixed = content;
    fixed = fixed.replace(
      UNIX_PATH_FIX_RE,
      (_, p) => p.startsWith("/home/") ? p.replace(/^\/home\/[^/]+/, "$HOME") : p.replace(/^\/[^/]+\/[^/]+/, "${PROJECT_ROOT}")
    );
    fixed = fixed.replace(WIN_PATH_FIX_RE, "%PROJECT_ROOT%\\");
    fixed = fixed.replace(LOCALHOST_FIX_RE, "localhost:$PORT");
    if (fixed !== content) {
      content = fixed;
      fixedSet.add("hardcoded-environment");
    }
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
import { writeFileSync as writeFileSync2, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
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

## Overview

[One-paragraph description of what this project does and its main purpose.]

**Tech stack:** [e.g. Python \xB7 FastAPI \xB7 PostgreSQL]

**Repository layout:** [brief directory summary]

## Scope

This agent is responsible for [specific domain, e.g. "managing the CI/CD pipeline and release process"]. It does not handle [out-of-scope domain, e.g. "infrastructure provisioning or database migrations"]. For those, use [other agent or human process].

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

## When to Escalate

Stop and involve a human if:

- The task requires accessing systems or credentials not listed under Available Tools.
- The change is irreversible and you are uncertain about the impact (e.g. a data migration or deletion).
- You encounter an ambiguity that cannot be resolved from the files already available.

Transfer control by stopping work, summarising what you found, and stating clearly what decision is needed.

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
      return { path: resolve(cwd, "CLAUDE.md") };
    case "agents":
      return { path: resolve(cwd, "AGENTS.md") };
    case "cursor":
      return {
        path: resolve(cwd, ".cursor", "rules", "main.mdc"),
        dir: resolve(cwd, ".cursor", "rules")
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
  const existed = existsSync(filePath);
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

// src/discovery.ts
import { existsSync as existsSync2, readdirSync } from "fs";
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
    if (existsSync2(full)) files.push(full);
  }
  for (const { dir, ext } of SCANNED_DIRS) {
    const full = resolve2(cwd, dir);
    if (!existsSync2(full)) continue;
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
      if (existsSync2(full)) found.add(full);
    }
    for (const { dir: subDir, ext } of SCANNED_DIRS) {
      const full = resolve2(dir, subDir);
      if (!existsSync2(full)) continue;
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

// src/output/html-reporter.ts
var SEVERITY_ORDER = ["critical", "warning", "suggestion"];
var GRADE_COLOR = {
  A: "#22c55e",
  B: "#84cc16",
  C: "#f59e0b",
  D: "#f97316",
  F: "#ef4444"
};
var SEV_COLOR = {
  critical: "#ef4444",
  warning: "#f59e0b",
  suggestion: "#3b82f6"
};
var SEV_LABEL = {
  critical: "\u{1F534} Critical",
  warning: "\u26A0\uFE0F Warning",
  suggestion: "\u{1F4A1} Suggestion"
};
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function renderBar(value) {
  const pct = Math.round(value);
  const color = pct >= 85 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";
  return `<div class="bar-wrap"><div class="bar" style="width:${pct}%;background:${color}"></div><span class="bar-val">${pct}</span></div>`;
}
function renderIssue(issue, idx) {
  const color = SEV_COLOR[issue.severity];
  const label = SEV_LABEL[issue.severity];
  return `
    <details class="issue" id="issue-${idx}">
      <summary>
        <span class="badge" style="background:${color}">${label}</span>
        <span class="rule-id">${esc(issue.ruleId)}</span>
        ${issue.line !== void 0 ? `<span class="line-num">line ${issue.line}</span>` : ""}
        <span class="msg">${esc(issue.message)}</span>
      </summary>
      <div class="issue-body">
        ${issue.context ? `<pre class="ctx">${esc(issue.context)}</pre>` : ""}
        <p class="suggestion"><strong>Suggestion:</strong> ${esc(issue.suggestion)}</p>
      </div>
    </details>`;
}
function renderResult(result) {
  const gradeColor = GRADE_COLOR[result.grade] ?? "#6b7280";
  const critical = result.issues.filter((i) => i.severity === "critical");
  const warnings = result.issues.filter((i) => i.severity === "warning");
  const suggestions = result.issues.filter((i) => i.severity === "suggestion");
  const issueHtml = result.issues.length === 0 ? `<p class="no-issues">\u2705 No issues found</p>` : SEVERITY_ORDER.flatMap(
    (sev) => result.issues.filter((i) => i.severity === sev).map((issue, idx) => renderIssue(issue, idx))
  ).join("");
  const dims = result.readinessDimensions;
  return `
  <section class="file-card">
    <div class="file-header">
      <span class="file-path">${esc(result.file)}</span>
      <span class="grade" style="color:${gradeColor}">${result.grade}</span>
      <span class="score">${result.score} / 100</span>
    </div>

    <div class="summary-row">
      ${critical.length > 0 ? `<span class="chip chip-critical">${critical.length} critical</span>` : ""}
      ${warnings.length > 0 ? `<span class="chip chip-warning">${warnings.length} warning</span>` : ""}
      ${suggestions.length > 0 ? `<span class="chip chip-suggestion">${suggestions.length} suggestion</span>` : ""}
      ${result.issues.length === 0 ? `<span class="chip chip-pass">All clear</span>` : ""}
      <span class="chip chip-tokens">${result.tokenCount} tokens</span>
    </div>

    <div class="readiness">
      <h3>Agent Readiness <span class="readiness-score">${result.readinessScore} / 100</span></h3>
      <table class="dims">
        <tr><th>Observable</th><td>${renderBar(dims.observable)}</td></tr>
        <tr><th>Bounded</th><td>${renderBar(dims.bounded)}</td></tr>
        <tr><th>Reversible</th><td>${renderBar(dims.reversible)}</td></tr>
        <tr><th>Tooled</th><td>${renderBar(dims.tooled)}</td></tr>
        <tr><th>Documented</th><td>${renderBar(dims.documented)}</td></tr>
      </table>
    </div>

    <div class="issues">
      <h3>Issues (${result.issues.length})</h3>
      ${issueHtml}
    </div>
  </section>`;
}
function formatHtml(results) {
  const totalIssues = results.flatMap((r) => r.issues).length;
  const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19) + " UTC";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Doctor Report</title>
<style>
  :root {
    --bg: #0f172a;
    --surface: #1e293b;
    --border: #334155;
    --text: #e2e8f0;
    --muted: #94a3b8;
    --accent: #38bdf8;
    --radius: 8px;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme="dark"]) {
      --bg: #f8fafc;
      --surface: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
      --accent: #0284c7;
    }
  }
  :root[data-theme="light"] {
    --bg: #f8fafc;
    --surface: #ffffff;
    --border: #e2e8f0;
    --text: #0f172a;
    --muted: #64748b;
    --accent: #0284c7;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 14px; line-height: 1.6; padding: 16px; }
  a { color: var(--accent); }

  header { display: flex; align-items: center; gap: 16px; padding: 20px 0 24px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  header h1 { font-size: 22px; }
  .meta { color: var(--muted); font-size: 12px; }
  .theme-btn { margin-left: auto; background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 4px 10px; border-radius: var(--radius); cursor: pointer; font-size: 12px; }

  .overall { display: flex; gap: 16px; margin: 20px 0; flex-wrap: wrap; }
  .stat-tile { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 20px; min-width: 120px; text-align: center; }
  .stat-tile .val { font-size: 32px; font-weight: 700; }
  .stat-tile .lbl { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }

  .file-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 20px; overflow: hidden; }
  .file-header { display: flex; align-items: center; gap: 12px; padding: 16px 20px; background: var(--bg); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .file-path { font-family: monospace; font-size: 13px; flex: 1; word-break: break-all; }
  .grade { font-size: 28px; font-weight: 800; }
  .score { color: var(--muted); font-size: 13px; }

  .summary-row { display: flex; gap: 6px; flex-wrap: wrap; padding: 10px 20px; border-bottom: 1px solid var(--border); }
  .chip { font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
  .chip-critical { background: #450a0a; color: #fca5a5; }
  .chip-warning { background: #451a03; color: #fcd34d; }
  .chip-suggestion { background: #172554; color: #93c5fd; }
  .chip-pass { background: #052e16; color: #86efac; }
  .chip-tokens { background: var(--border); color: var(--muted); }

  .readiness, .issues { padding: 16px 20px; }
  .readiness { border-bottom: 1px solid var(--border); }
  .readiness h3, .issues h3 { font-size: 13px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 10px; }
  .readiness-score { font-size: 15px; color: var(--text); font-weight: 700; }

  table.dims { width: 100%; border-collapse: collapse; }
  table.dims th { text-align: left; font-weight: 500; color: var(--muted); padding: 3px 0; width: 100px; font-size: 12px; }
  table.dims td { padding: 3px 0 3px 8px; }
  .bar-wrap { display: flex; align-items: center; gap: 8px; }
  .bar { height: 8px; border-radius: 4px; min-width: 2px; transition: width .3s; }
  .bar-val { font-size: 11px; color: var(--muted); width: 24px; }

  .no-issues { color: #86efac; font-size: 13px; padding: 8px 0; }

  details.issue { border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 8px; overflow: hidden; }
  details.issue summary { display: flex; align-items: flex-start; gap: 8px; padding: 10px 14px; cursor: pointer; list-style: none; flex-wrap: wrap; }
  details.issue summary::-webkit-details-marker { display: none; }
  details.issue summary:hover { background: var(--bg); }
  .badge { font-size: 11px; padding: 2px 7px; border-radius: 4px; color: #fff; font-weight: 600; white-space: nowrap; }
  .rule-id { font-family: monospace; font-size: 12px; color: var(--accent); white-space: nowrap; }
  .line-num { font-family: monospace; font-size: 11px; color: var(--muted); white-space: nowrap; }
  .msg { font-size: 13px; flex: 1; }
  .issue-body { padding: 10px 14px; border-top: 1px solid var(--border); background: var(--bg); }
  .ctx { font-family: monospace; font-size: 12px; background: var(--surface); padding: 8px 12px; border-radius: 4px; overflow-x: auto; margin-bottom: 8px; white-space: pre-wrap; word-break: break-all; }
  .suggestion { font-size: 13px; color: var(--muted); }

  footer { color: var(--muted); font-size: 11px; text-align: center; padding: 20px 0 8px; border-top: 1px solid var(--border); margin-top: 20px; }
</style>
</head>
<body>
<header>
  <div>
    <h1>\u{1FA7A} Agent Doctor Report</h1>
    <p class="meta">Generated ${esc(generatedAt)} \xB7 ${results.length} file${results.length !== 1 ? "s" : ""} \xB7 ${totalIssues} total issue${totalIssues !== 1 ? "s" : ""}</p>
  </div>
  <button class="theme-btn" onclick="toggleTheme()">Toggle theme</button>
</header>

<div class="overall">
  <div class="stat-tile">
    <div class="val">${avgScore}</div>
    <div class="lbl">Avg score</div>
  </div>
  <div class="stat-tile">
    <div class="val">${results.filter((r) => r.issues.filter((i) => i.severity === "critical").length > 0).length}</div>
    <div class="lbl">Files with criticals</div>
  </div>
  <div class="stat-tile">
    <div class="val">${totalIssues}</div>
    <div class="lbl">Total issues</div>
  </div>
  <div class="stat-tile">
    <div class="val">${results.filter((r) => r.issues.length === 0).length}</div>
    <div class="lbl">Clean files</div>
  </div>
</div>

${results.map(renderResult).join("")}

<footer>
  Generated by <a href="https://github.com/chiragdarji/agent-doctor">@chiragdarji/agent-doctor</a>
</footer>

<script>
function toggleTheme() {
  var r = document.documentElement;
  var t = r.getAttribute('data-theme');
  r.setAttribute('data-theme', t === 'light' ? 'dark' : 'light');
  try { localStorage.setItem('agent-doctor-theme', r.getAttribute('data-theme')); } catch(e) {}
}
try {
  var saved = localStorage.getItem('agent-doctor-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
} catch(e) {}
</script>
</body>
</html>`;
}

// src/analyser/history.ts
import { execFileSync } from "child_process";
import { extname, dirname, relative, resolve as resolve3, basename as basename3, join as join2 } from "path";
import { execFile } from "child_process";
import { realpathSync } from "fs";
import { promisify } from "util";
var execFileAsync = promisify(execFile);
async function runHistory(filePath, config, n = 10) {
  const rawAbsPath = resolve3(process.cwd(), filePath);
  let absPath;
  try {
    absPath = join2(realpathSync(dirname(rawAbsPath)), basename3(rawAbsPath));
  } catch {
    absPath = rawAbsPath;
  }
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
  const gitRelPath = relative(gitRoot, absPath);
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
import chalk4 from "chalk";

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

// src/output/history-reporter.ts
function scoreTrend(entries) {
  if (entries.length < 2) return "";
  const first = entries[entries.length - 1].score;
  const last = entries[0].score;
  const delta = last - first;
  if (delta > 0) return chalk4.green(` \u2191${delta}`);
  if (delta < 0) return chalk4.red(` \u2193${Math.abs(delta)}`);
  return chalk4.dim(" \u21920");
}
function formatHistory(entries, filePath) {
  if (entries.length === 0) {
    return chalk4.yellow(`No git history found for ${filePath}`);
  }
  const lines = [];
  lines.push("");
  lines.push(chalk4.bold(`Score history \u2014 ${filePath}`) + scoreTrend(entries));
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
    chalk4.dim("COMMIT ".padEnd(COL.commit + 1)),
    chalk4.dim("DATE       "),
    chalk4.dim("SCORE"),
    chalk4.dim(" GRD"),
    chalk4.dim(" RDNS"),
    chalk4.dim(" ISSUES"),
    chalk4.dim(" SUBJECT")
  ].join("");
  lines.push(header);
  lines.push(chalk4.dim("\u2500".repeat(80)));
  for (const entry of entries) {
    const scoreStr = String(entry.score).padStart(COL.score);
    const scoreColoured = scoreColour2(entry.score, scoreStr);
    const issueStr = entry.criticalCount > 0 ? chalk4.red(String(entry.issueCount).padStart(COL.issues)) : entry.warningCount > 0 ? chalk4.yellow(String(entry.issueCount).padStart(COL.issues)) : chalk4.green(String(entry.issueCount).padStart(COL.issues));
    const subjectTrunc = entry.subject.length > COL.subject ? entry.subject.slice(0, COL.subject - 1) + "\u2026" : entry.subject;
    lines.push(
      `${chalk4.dim(entry.commit)}  ${chalk4.dim(entry.date)}  ${scoreColoured}  ${gradeColour2(entry.grade)}  ${String(entry.readinessScore).padStart(4)}  ${issueStr}  ${chalk4.dim(subjectTrunc)}`
    );
  }
  lines.push("");
  lines.push(
    chalk4.dim(
      `${entries.length} commit${entries.length !== 1 ? "s" : ""} \xB7 structural analysis only`
    )
  );
  lines.push("");
  return lines.join("\n");
}
function formatHistoryJson(entries, filePath) {
  return JSON.stringify({ file: filePath, history: entries }, null, 2);
}

// src/output/org-reporter.ts
import chalk5 from "chalk";
import { basename as basename4, relative as relative2 } from "path";
function gradeCount(grade, count) {
  if (count === 0) return chalk5.dim("0");
  if (grade === "A") return chalk5.green(String(count));
  if (grade === "B") return chalk5.cyan(String(count));
  if (grade === "C") return chalk5.yellow(String(count));
  return chalk5.red(String(count));
}
function scoreBar(score, width = 20) {
  const filled = Math.round(score / 100 * width);
  const bar2 = "\u2588".repeat(filled) + "\u2591".repeat(width - filled);
  if (score >= 85) return chalk5.green(bar2);
  if (score >= 60) return chalk5.yellow(bar2);
  return chalk5.red(bar2);
}
function fileTypeLabel(filePath) {
  const base = basename4(filePath);
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
  return `  ${chalk5.dim(padded)} ${scoreBar(score, 12)} ${num}`;
}
function formatOrgReport(results, root) {
  if (results.length === 0) {
    return chalk5.yellow("No agent instruction files found in this workspace.");
  }
  const lines = [];
  lines.push("");
  lines.push(chalk5.bold(`Org Health Dashboard \u2014 ${relative2(process.cwd(), root) || "."}`));
  lines.push(chalk5.dim(`${results.length} file${results.length !== 1 ? "s" : ""} analysed`));
  lines.push("");
  const groups = groupByType(results);
  lines.push(
    chalk5.dim(
      `${"TYPE".padEnd(26)}${"FILES".padStart(6)}  ${"AVG SCORE".padEnd(10)}${"AVG RDNS".padEnd(10)}${"A".padStart(3)}${"B".padStart(3)}${"C".padStart(3)}${"D".padStart(3)}${"F".padStart(3)}`
    )
  );
  lines.push(chalk5.dim("\u2500".repeat(72)));
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
  lines.push(chalk5.bold("Overall readiness dimensions"));
  lines.push("");
  lines.push(formatDimensionRow("Observable", overall.avgDims.observable));
  lines.push(formatDimensionRow("Bounded", overall.avgDims.bounded));
  lines.push(formatDimensionRow("Reversible", overall.avgDims.reversible));
  lines.push(formatDimensionRow("Tooled", overall.avgDims.tooled));
  lines.push(formatDimensionRow("Documented", overall.avgDims.documented));
  lines.push("");
  lines.push(
    chalk5.bold("Overall avg score: ") + scoreColour2(overall.avgScore) + chalk5.dim("  |  ") + chalk5.bold("Avg readiness: ") + scoreColour2(overall.avgReadiness)
  );
  lines.push("");
  lines.push(chalk5.bold("Files"));
  lines.push("");
  for (const r of results) {
    const rel = relative2(root, r.file) || basename4(r.file);
    const scoreStr = scoreColour2(r.score, String(r.score).padStart(3));
    const issueStr = r.issues.length === 0 ? chalk5.green("\u2713") : chalk5.yellow(`${r.issues.length} issue${r.issues.length !== 1 ? "s" : ""}`);
    lines.push(`  ${scoreStr}  ${chalk5.dim(r.grade)}  ${issueStr.padEnd(10)}  ${rel}`);
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
        file: relative2(root, r.file) || basename4(r.file),
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
export {
  DEFAULT_CONFIG,
  analyse,
  analyseAll,
  analyseSemantics,
  applyFixes,
  applyPlatformOverrides,
  countTokens,
  createAnthropicClient,
  createClientFromConfig,
  createOpenAIClient,
  createOpenAICompatibleClient,
  detectPlatform,
  discoverFiles,
  discoverOrgFiles,
  formatHistory,
  formatHistoryJson,
  formatHtml,
  formatOrgReport,
  formatOrgReportJson,
  formatReadinessReport,
  formatResult,
  formatResultJson,
  formatResults,
  formatResultsJson,
  inferProvider,
  initFile,
  loadConfig,
  loadPlugins,
  parseFile,
  parseMarkdown,
  parseMdc,
  parseSections,
  resolveProvider,
  runHistory,
  runStructuralAnalysis,
  templateFor
};
//# sourceMappingURL=index.js.map