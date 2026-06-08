#!/usr/bin/env node
import {
  parseSections
} from "./chunk-N25LFLMI.js";

// src/rules/structural/missing-frontmatter.ts
var missingFrontmatter = (content, filePath) => {
  if (!filePath.endsWith(".mdc")) return [];
  if (content.trimStart().startsWith("---")) return [];
  return [
    {
      ruleId: "missing-frontmatter",
      severity: "warning",
      message: ".mdc file is missing a YAML frontmatter block",
      suggestion: "Add a frontmatter block at the top of the file:\n---\nalwaysApply: true\n---"
    }
  ];
};

// src/rules/structural/missing-always-apply.ts
import { load as yamlLoad } from "js-yaml";
function extractFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match || match[1] === void 0) return {};
  try {
    const parsed = yamlLoad(match[1]);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
var missingAlwaysApply = (content, filePath) => {
  if (!filePath.endsWith(".mdc")) return [];
  const frontmatter = extractFrontmatter(content);
  if (frontmatter["alwaysApply"] === true) return [];
  return [
    {
      ruleId: "missing-always-apply",
      severity: "warning",
      message: "`alwaysApply` is not set to `true` \u2014 Cursor agent mode may silently ignore this rule",
      suggestion: "Add `alwaysApply: true` to the YAML frontmatter block"
    }
  ];
};

// src/rules/structural/legacy-format.ts
import { basename } from "path";
var legacyFormat = (_content, filePath) => {
  if (basename(filePath) !== ".cursorrules") return [];
  return [
    {
      ruleId: "legacy-format",
      severity: "critical",
      message: "`.cursorrules` is a legacy format not read by Cursor agent mode",
      suggestion: "Migrate rules to `.cursor/rules/*.mdc` files with `alwaysApply: true` frontmatter"
    }
  ];
};

// src/rules/structural/token-budget-exceeded.ts
function createTokenBudgetRule(threshold) {
  return (content, _filePath) => {
    const sections = parseSections(content);
    const issues = [];
    for (const section of sections) {
      if (section.tokenCount > threshold) {
        issues.push({
          ruleId: "token-budget-exceeded",
          severity: "warning",
          message: `Section "${section.heading}" is ${section.tokenCount} tokens (limit: ${threshold})`,
          suggestion: `Split "${section.heading}" into smaller sub-sections or remove redundant content`,
          line: section.line,
          context: section.heading
        });
      }
    }
    return issues;
  };
}

// src/rules/structural/empty-section.ts
var emptySection = (content, _filePath) => {
  const sections = parseSections(content);
  const issues = [];
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (section.content.trim() !== "") continue;
    const next = sections[i + 1];
    if (next !== void 0 && next.level > section.level) continue;
    issues.push({
      ruleId: "empty-section",
      severity: "suggestion",
      message: `Section "${section.heading}" has no content`,
      suggestion: `Add instructions under "${section.heading}" or remove the heading`,
      line: section.line,
      context: section.heading
    });
  }
  return issues;
};

// src/rules/structural/duplicate-heading.ts
var duplicateHeading = (content, _filePath) => {
  const lines = content.split("\n");
  const seen = /* @__PURE__ */ new Map();
  const issues = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) continue;
    const heading = match[2].trim();
    const key = heading.toLowerCase();
    const firstLine = seen.get(key);
    if (firstLine !== void 0) {
      issues.push({
        ruleId: "duplicate-heading",
        severity: "warning",
        message: `Heading "${heading}" appears more than once`,
        suggestion: `Rename or merge the duplicate sections \u2014 agents cannot determine which copy takes precedence`,
        line: i + 1,
        context: heading,
        relatedLine: firstLine
      });
    } else {
      seen.set(key, i + 1);
    }
  }
  return issues;
};

// src/rules/structural/missing-description.ts
import { load as yamlLoad2 } from "js-yaml";
var FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
function getFrontmatter(content) {
  const match = FRONTMATTER_RE.exec(content);
  if (!match || match[1] === void 0) return {};
  try {
    const parsed = yamlLoad2(match[1]);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
var missingDescription = (content, filePath) => {
  if (!filePath.endsWith(".mdc")) return [];
  const fm = getFrontmatter(content);
  const description = fm["description"];
  const hasDescription2 = typeof description === "string" && description.trim().length > 0;
  if (hasDescription2) return [];
  return [
    {
      ruleId: "missing-description",
      severity: "warning",
      message: "No `description` field in frontmatter \u2014 Cursor cannot match this rule contextually",
      suggestion: "Add a concise `description:` to the YAML frontmatter explaining when this rule applies"
    }
  ];
};

// src/rules/structural/unclosed-code-block.ts
var unclosedCodeBlock = (content, _filePath) => {
  const lines = content.split("\n");
  const issues = [];
  let backtickDepth = 0;
  let backtickOpenLine = 0;
  let tildeDepth = 0;
  let tildeOpenLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^```/.test(line)) {
      backtickDepth++;
      if (backtickDepth % 2 === 1) backtickOpenLine = i + 1;
    } else if (/^~~~/.test(line)) {
      tildeDepth++;
      if (tildeDepth % 2 === 1) tildeOpenLine = i + 1;
    }
  }
  if (backtickDepth % 2 !== 0) {
    issues.push({
      ruleId: "unclosed-code-block",
      severity: "critical",
      message: "Unclosed code fence (```) \u2014 everything after this line is treated as code",
      suggestion: "Add a closing ``` fence to end the code block",
      line: backtickOpenLine,
      context: "```"
    });
  }
  if (tildeDepth % 2 !== 0) {
    issues.push({
      ruleId: "unclosed-code-block",
      severity: "critical",
      message: "Unclosed code fence (~~~) \u2014 everything after this line is treated as code",
      suggestion: "Add a closing ~~~ fence to end the code block",
      line: tildeOpenLine,
      context: "~~~"
    });
  }
  return issues;
};

// src/rules/structural/conflicting-frontmatter.ts
import { load as yamlLoad3 } from "js-yaml";
var FRONTMATTER_RE2 = /^---\r?\n([\s\S]*?)\r?\n---/;
function getFrontmatter2(content) {
  const match = FRONTMATTER_RE2.exec(content);
  if (!match || match[1] === void 0) return {};
  try {
    const parsed = yamlLoad3(match[1]);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function hasGlobs(fm) {
  const globs = fm["globs"];
  if (typeof globs === "string") return globs.trim().length > 0;
  if (Array.isArray(globs)) return globs.length > 0;
  return false;
}
var conflictingFrontmatter = (content, filePath) => {
  if (!filePath.endsWith(".mdc")) return [];
  const fm = getFrontmatter2(content);
  if (fm["alwaysApply"] === true && hasGlobs(fm)) {
    return [
      {
        ruleId: "conflicting-frontmatter",
        severity: "warning",
        message: "`alwaysApply: true` and `globs` are both set \u2014 `globs` has no effect",
        suggestion: "Remove `globs` (rule already applies everywhere) or set `alwaysApply: false` to enable glob-scoped activation"
      }
    ];
  }
  return [];
};

// src/rules/structural/missing-file-glob.ts
import { load as yamlLoad4 } from "js-yaml";
var FRONTMATTER_RE3 = /^---\r?\n([\s\S]*?)\r?\n---/;
function getFrontmatter3(content) {
  const match = FRONTMATTER_RE3.exec(content);
  if (!match || match[1] === void 0) return {};
  try {
    const parsed = yamlLoad4(match[1]);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function hasGlobs2(fm) {
  const globs = fm["globs"];
  if (typeof globs === "string") return globs.trim().length > 0;
  if (Array.isArray(globs)) return globs.length > 0;
  return false;
}
function hasDescription(fm) {
  const desc = fm["description"];
  return typeof desc === "string" && desc.trim().length > 0;
}
var missingFileGlob = (content, filePath) => {
  if (!filePath.endsWith(".mdc")) return [];
  const fm = getFrontmatter3(content);
  if (fm["alwaysApply"] === true) return [];
  if (hasGlobs2(fm)) return [];
  const severity = hasDescription(fm) ? "suggestion" : "warning";
  return [
    {
      ruleId: "missing-file-glob",
      severity,
      message: "`alwaysApply` is false and no `globs` pattern is set \u2014 rule may never activate",
      suggestion: "Add a `globs:` pattern (e.g. `**/*.ts`) or set `alwaysApply: true` to guarantee activation"
    }
  ];
};

// src/rules/structural/heading-depth-skip.ts
var headingDepthSkip = (content, _filePath) => {
  const lines = content.split("\n");
  const issues = [];
  let prevLevel = 0;
  let prevHeading = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) continue;
    const level = match[1].length;
    const heading = match[2].trim();
    if (prevLevel > 0 && level > prevLevel + 1) {
      issues.push({
        ruleId: "heading-depth-skip",
        severity: "suggestion",
        message: `Heading level jumps from ${"#".repeat(prevLevel)} to ${"#".repeat(level)} \u2014 skips ${level - prevLevel - 1} level(s)`,
        suggestion: `Use ${"#".repeat(prevLevel + 1)} "${heading}" to maintain hierarchy, or restructure the section under "${prevHeading}"`,
        line: i + 1,
        context: heading,
        relatedLine: i
        // previous heading line (approximate)
      });
    }
    prevLevel = level;
    prevHeading = heading;
  }
  return issues;
};

// src/rules/structural/negation-heavy.ts
var NEGATION_RE = /^[-*]\s+(don't|do not|never|avoid|not |no )/i;
var BULLET_RE = /^[-*]\s+/;
var MIN_BULLETS = 4;
var NEGATION_THRESHOLD = 0.6;
var negationHeavy = (content, _filePath) => {
  const sections = parseSections(content);
  const issues = [];
  for (const section of sections) {
    const bullets = section.content.split("\n").filter((line) => BULLET_RE.test(line));
    if (bullets.length < MIN_BULLETS) continue;
    const negations = bullets.filter((line) => NEGATION_RE.test(line));
    const ratio = negations.length / bullets.length;
    if (ratio >= NEGATION_THRESHOLD) {
      issues.push({
        ruleId: "negation-heavy",
        severity: "suggestion",
        message: `Section "${section.heading}" has ${Math.round(ratio * 100)}% negation-based instructions (${negations.length}/${bullets.length} bullets)`,
        suggestion: `Rewrite "don't/never/avoid" rules as positive instructions \u2014 e.g. "Never write long responses" \u2192 "Keep responses under 100 words"`,
        line: section.line,
        context: section.heading
      });
    }
  }
  return issues;
};

// src/rules/structural/todo-in-instructions.ts
var TODO_RE = /\b(TODO|FIXME|HACK|PLACEHOLDER|XXX|TBD)\b/;
var todoInInstructions = (content, _filePath) => {
  const lines = content.split("\n");
  const issues = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const match = TODO_RE.exec(line);
    if (!match) continue;
    issues.push({
      ruleId: "todo-in-instructions",
      severity: "critical",
      message: `Incomplete instruction marker "${match[0]}" found \u2014 agent will follow this literally`,
      suggestion: "Replace the placeholder with the actual instruction before using this file",
      line: i + 1,
      context: line.trim()
    });
  }
  return issues;
};

// src/rules/structural/missing-success-criteria.ts
var TASK_VERBS_RE = /\b(implement|build|create|deploy|execute|generate|migrate|refactor|integrate|develop|set up|configure|write)\b/i;
var SUCCESS_SIGNAL_RE = /\b(done when|success(fully)?|complete when|verify|confirm|check|test|assert|expected|should result|acceptance|pass(es)?|validated?)\b/i;
var SKIP_HEADING_RE = /\b(example|overview|background|introduction|context|about|reference)\b/i;
var MIN_SENTENCES = 3;
var missingSuccessCriteria = (content, _filePath) => {
  const sections = parseSections(content);
  const issues = [];
  for (const section of sections) {
    if (SKIP_HEADING_RE.test(section.heading)) continue;
    const text = section.content.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "");
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
    if (sentences.length < MIN_SENTENCES) continue;
    if (TASK_VERBS_RE.test(text) && !SUCCESS_SIGNAL_RE.test(text)) {
      issues.push({
        ruleId: "missing-success-criteria",
        severity: "warning",
        message: `Section "${section.heading}" describes tasks but has no success criteria or completion signal`,
        suggestion: 'Add a verification step: e.g. "Done when all tests pass" or "Verify by running <command> and confirming <expected output>"',
        line: section.line,
        context: section.heading
      });
    }
  }
  return issues;
};

// src/rules/structural/hardcoded-environment.ts
var UNIX_PATH_RE = /(?<![`'"/\w])(\/(?:home|usr|etc|var|root|opt|srv|tmp|proc|sys)\/\S+)/g;
var WIN_PATH_RE = /\b([A-Z]:\\[\w\\.\- ]+)/g;
var LOCALHOST_RE = /\blocalhost:(\d{2,5})\b/g;
var EXAMPLE_LINE_RE = /\b(e\.?g\.?|for example|example[s]?|sample|illustration|demo)\b/i;
var hardcodedEnvironment = (content, _filePath) => {
  const lines = content.split("\n");
  const issues = [];
  let inCodeBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^```|^~~~/.test(line.trim())) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    if (EXAMPLE_LINE_RE.test(line)) continue;
    const lineNum = i + 1;
    for (const re of [UNIX_PATH_RE, WIN_PATH_RE]) {
      re.lastIndex = 0;
      let match2;
      while ((match2 = re.exec(line)) !== null) {
        const path = match2[1] ?? match2[0];
        issues.push({
          ruleId: "hardcoded-environment",
          severity: "warning",
          message: `Hardcoded path "${path}" ties these instructions to a specific environment`,
          suggestion: "Replace with an environment variable (e.g. $HOME, $PROJECT_ROOT) or a relative path",
          line: lineNum,
          context: line.trim()
        });
      }
    }
    LOCALHOST_RE.lastIndex = 0;
    let match;
    while ((match = LOCALHOST_RE.exec(line)) !== null) {
      const port = match[1] ?? "";
      issues.push({
        ruleId: "hardcoded-environment",
        severity: "warning",
        message: `Hardcoded localhost:${port} assumes a specific port will always be available`,
        suggestion: "Reference the port via an environment variable or note it as a configurable value",
        line: lineNum,
        context: line.trim()
      });
    }
  }
  return issues;
};

// src/rules/structural/missing-tool-list.ts
var TOOL_REFERENCE_RE = /\b(you have access to|use the .{1,40} tool|call(ing)? the .{1,40} (tool|function|api)|invoke|available tool[s]?|the following tool[s]?)\b/i;
var TOOL_SECTION_RE = /(tool|capabilit\w*|available|command|function|action)/i;
var missingToolList = (content, _filePath) => {
  if (!TOOL_REFERENCE_RE.test(content)) return [];
  const sections = parseSections(content);
  const hasToolSection = sections.some((s) => TOOL_SECTION_RE.test(s.heading));
  if (hasToolSection) return [];
  return [
    {
      ruleId: "missing-tool-list",
      severity: "suggestion",
      message: "File references tool usage but has no section enumerating the available tools",
      suggestion: 'Add a "## Available Tools" section listing each tool with its name, purpose, and key parameters'
    }
  ];
};

// src/analyser/platform.ts
function detectPlatform(fileType) {
  switch (fileType) {
    case "claude-md":
    case "claude-agent":
    case "claude-command":
      return "anthropic";
    case "agents-md":
      return "openai";
    case "cursor-mdc":
      return "cursor";
    case "gemini-md":
      return "gemini";
    case "copilot-instructions":
      return "github-copilot";
    case "windsurf-rules":
      return "windsurf";
    case "roo-rule":
    default:
      return "unknown";
  }
}
var PLATFORM_SUGGESTIONS = {
  "missing-tool-list": {
    anthropic: 'Add a "## Available Tools" section listing tools by name. Example: Bash, Read, Write, Edit, Glob, Grep, Agent.',
    openai: 'Add a "## Tools" section listing the tool names that match your OpenAI tool definitions.',
    cursor: "Add a section enumerating the Cursor tools your rule depends on (e.g. codebase_search, read_file, edit_file).",
    "github-copilot": 'List the tools or extensions available to Copilot in an explicit "## Available capabilities" section.'
  },
  "missing-success-criteria": {
    anthropic: 'Add a success signal after the task, e.g.: "> \u2705 Done when: all tests pass and the feature works end-to-end."',
    openai: 'Define a completion check, e.g.: "The task is complete when the output matches the expected schema and no errors are logged."',
    cursor: 'Add a completion note: "Verified when the file compiles, tests pass, and no diagnostics appear."'
  },
  "hardcoded-environment": {
    anthropic: "Use placeholders like `<project-root>` or environment variables (e.g. `$HOME`) instead of absolute paths.",
    openai: "Replace absolute paths with relative paths or environment variables set in your run configuration.",
    cursor: "Use workspace-relative paths \u2014 Cursor resolves paths from the workspace root, not the OS home directory."
  },
  "missing-recovery-strategy": {
    anthropic: 'Add a fallback instruction, e.g.: "If the deploy fails, run ./rollback.sh and open a GitHub issue with the error log."',
    openai: 'Define error handling: "On failure, log the error to errors.log, revert the last change, and halt the pipeline."',
    cursor: 'Add recovery guidance: "If the command errors, undo all file changes and report the error to the user."'
  },
  "unobservable-outcome": {
    anthropic: 'Add a verification step: "Run `npm test` and confirm all tests pass before considering this done."',
    openai: 'Add an assertion: "Verify by checking the API response matches the expected schema and status is 200."'
  }
};
var PLATFORM_SEVERITY_OVERRIDES = {
  // On Cursor, missing alwaysApply causes the rule to be silently skipped — treat as critical
  "missing-always-apply": {
    cursor: "critical"
  },
  // On Cursor, missing frontmatter prevents the file from loading at all
  "missing-frontmatter": {
    cursor: "critical"
  }
};
function applyPlatformOverrides(issues, platform) {
  if (platform === "unknown") return issues;
  return issues.map((issue) => {
    const ruleId = issue.ruleId;
    const suggestionOverride = PLATFORM_SUGGESTIONS[ruleId]?.[platform];
    const severityOverride = PLATFORM_SEVERITY_OVERRIDES[ruleId]?.[platform];
    if (!suggestionOverride && !severityOverride) return issue;
    return {
      ...issue,
      ...suggestionOverride ? { suggestion: suggestionOverride } : {},
      ...severityOverride ? { severity: severityOverride } : {}
    };
  });
}

// src/analyser/structural.ts
function runStructuralAnalysis(parsed, config, pluginRules = []) {
  const rules = [
    // Format / frontmatter rules
    missingFrontmatter,
    missingAlwaysApply,
    missingDescription,
    conflictingFrontmatter,
    missingFileGlob,
    legacyFormat,
    // Content quality rules
    emptySection,
    duplicateHeading,
    headingDepthSkip,
    unclosedCodeBlock,
    negationHeavy,
    todoInInstructions,
    // Token budget
    createTokenBudgetRule(config.tokenBudgetWarning),
    // Agent readiness rules (Factory.ai + OpenAI Harness frameworks)
    missingSuccessCriteria,
    hardcodedEnvironment,
    missingToolList
  ];
  const platform = detectPlatform(parsed.fileType);
  const rawIssues = [
    ...rules.flatMap((rule) => rule(parsed.rawContent, parsed.filePath)),
    ...pluginRules.flatMap((rule) => rule(parsed.rawContent, parsed.filePath))
  ].filter((issue) => config.rules[issue.ruleId] !== "off");
  return applyPlatformOverrides(rawIssues, platform);
}

export {
  runStructuralAnalysis
};
//# sourceMappingURL=chunk-RXZSUZDW.js.map