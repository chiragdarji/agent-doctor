#!/usr/bin/env node

// src/cli.ts
import chalk6 from "chalk";
import { Command } from "commander";
import { resolve as resolve6, relative as relative3, dirname as dirname2, join as join2, basename as basename7 } from "path";
import { existsSync as existsSync3, watch as fsWatch } from "fs";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

// src/parser/index.ts
import { extname, basename as basename2 } from "path";

// src/parser/markdown.ts
import { readFileSync } from "fs";
import { basename } from "path";
import { load as yamlLoad } from "js-yaml";

// src/tokens.ts
import { get_encoding } from "tiktoken";
var _enc = null;
function getEncoder() {
  if (!_enc) {
    _enc = get_encoding("cl100k_base");
  }
  return _enc;
}
function countTokens(text) {
  try {
    return getEncoder().encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

// src/parser/sections.ts
function parseSections(content) {
  const lines = content.split("\n");
  const sections = [];
  let current = null;
  let bodyLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      if (current !== null) {
        finaliseSection(current, bodyLines, sections);
      }
      current = {
        heading: match[2].trim(),
        level: match[1].length,
        content: "",
        line: i + 1,
        tokenCount: 0
      };
      bodyLines = [];
    } else if (current !== null) {
      bodyLines.push(line);
    }
  }
  if (current !== null) {
    finaliseSection(current, bodyLines, sections);
  }
  return sections;
}
function finaliseSection(section, lines, out) {
  const body = lines.join("\n").trim();
  section.content = body;
  section.tokenCount = countTokens(body);
  out.push(section);
}

// src/parser/markdown.ts
var FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
function parseFrontmatter(raw) {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match || match[1] === void 0) return { content: raw, data: {} };
  const parsed = yamlLoad(match[1]);
  const data = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  return { content: match[2] ?? "", data };
}
function detectFileType(filePath) {
  const base = basename(filePath);
  const normalised = filePath.replace(/\\/g, "/");
  if (/^claude\.md$/i.test(base)) return "claude-md";
  if (/^agents\.md$/i.test(base)) return "agents-md";
  if (/^gemini\.md$/i.test(base)) return "gemini-md";
  if (normalised.toLowerCase().endsWith("copilot-instructions.md")) return "copilot-instructions";
  if (/\.claude\/agents\//i.test(normalised) && base.endsWith(".md")) return "claude-agent";
  if (/\.claude\/commands\//i.test(normalised) && base.endsWith(".md")) return "claude-command";
  return "unknown";
}
function parseMarkdown(filePath) {
  const raw = readFileSync(filePath, "utf8");
  return parseMarkdownContent(filePath, raw);
}
function parseMarkdownContent(filePath, rawContent) {
  const { content, data } = parseFrontmatter(rawContent);
  const sections = parseSections(content);
  const hasFrontmatter = Object.keys(data).length > 0;
  return {
    filePath,
    fileType: detectFileType(filePath),
    rawContent,
    content,
    ...hasFrontmatter ? { frontmatter: data } : {},
    sections,
    tokenCount: countTokens(content)
  };
}

// src/parser/mdc.ts
import { readFileSync as readFileSync2 } from "fs";
import { load as yamlLoad2 } from "js-yaml";
var FRONTMATTER_RE2 = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
function parseFrontmatter2(raw) {
  const match = FRONTMATTER_RE2.exec(raw);
  if (!match || match[1] === void 0) return { content: raw, data: {} };
  const parsed = yamlLoad2(match[1]);
  const data = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  return { content: match[2] ?? "", data };
}
function parseMdc(filePath) {
  const raw = readFileSync2(filePath, "utf8");
  return parseMdcContent(filePath, raw);
}
function parseMdcContent(filePath, rawContent) {
  const { content, data } = parseFrontmatter2(rawContent);
  const sections = parseSections(content);
  return {
    filePath,
    fileType: "cursor-mdc",
    rawContent,
    content,
    frontmatter: data,
    sections,
    tokenCount: countTokens(content)
  };
}

// src/parser/index.ts
function parseFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  const base = basename2(filePath);
  if (ext === ".mdc") return parseMdc(filePath);
  if (base === ".cursorrules") return parseMarkdown(filePath);
  if (ext === ".md") return parseMarkdown(filePath);
  return parseMarkdown(filePath);
}

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
import { load as yamlLoad3 } from "js-yaml";
function extractFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match || match[1] === void 0) return {};
  try {
    const parsed = yamlLoad3(match[1]);
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
import { basename as basename3 } from "path";
var legacyFormat = (_content, filePath) => {
  if (basename3(filePath) !== ".cursorrules") return [];
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
import { load as yamlLoad4 } from "js-yaml";
var FRONTMATTER_RE3 = /^---\r?\n([\s\S]*?)\r?\n---/;
function getFrontmatter(content) {
  const match = FRONTMATTER_RE3.exec(content);
  if (!match || match[1] === void 0) return {};
  try {
    const parsed = yamlLoad4(match[1]);
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
import { load as yamlLoad5 } from "js-yaml";
var FRONTMATTER_RE4 = /^---\r?\n([\s\S]*?)\r?\n---/;
function getFrontmatter2(content) {
  const match = FRONTMATTER_RE4.exec(content);
  if (!match || match[1] === void 0) return {};
  try {
    const parsed = yamlLoad5(match[1]);
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
import { load as yamlLoad6 } from "js-yaml";
var FRONTMATTER_RE5 = /^---\r?\n([\s\S]*?)\r?\n---/;
function getFrontmatter3(content) {
  const match = FRONTMATTER_RE5.exec(content);
  if (!match || match[1] === void 0) return {};
  try {
    const parsed = yamlLoad6(match[1]);
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

// src/config.ts
import { readFileSync as readFileSync3 } from "fs";
import { resolve as resolve2 } from "path";

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
  const configPath = resolve2(cwd, ".agentdoctor.json");
  try {
    const raw = readFileSync3(configPath, "utf8");
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
import { resolve as resolve3, join } from "path";
var WELL_KNOWN_FILES = [
  "CLAUDE.md",
  "AGENTS.md",
  "GEMINI.md",
  ".github/copilot-instructions.md",
  ".cursorrules"
];
var SCANNED_DIRS = [
  { dir: ".cursor/rules", ext: ".mdc" },
  { dir: ".claude/agents", ext: ".md" },
  { dir: ".claude/commands", ext: ".md" }
];
function discoverFiles(cwd = process.cwd()) {
  const files = [];
  for (const candidate of WELL_KNOWN_FILES) {
    const full = resolve3(cwd, candidate);
    if (existsSync(full)) files.push(full);
  }
  for (const { dir, ext } of SCANNED_DIRS) {
    const full = resolve3(cwd, dir);
    if (!existsSync(full)) continue;
    try {
      for (const entry of readdirSync(full)) {
        if (entry.endsWith(ext)) {
          files.push(resolve3(full, entry));
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
      const full = resolve3(dir, candidate);
      if (existsSync(full)) found.add(full);
    }
    for (const { dir: subDir, ext } of SCANNED_DIRS) {
      const full = resolve3(dir, subDir);
      if (!existsSync(full)) continue;
      try {
        for (const entry of readdirSync(full)) {
          if (entry.endsWith(ext)) found.add(resolve3(full, entry));
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
import { readFileSync as readFileSync4, writeFileSync } from "fs";
var AUTO_FIXABLE = /* @__PURE__ */ new Set([
  "todo-in-instructions",
  "unclosed-code-block",
  "empty-section",
  "missing-success-criteria"
]);
var TODO_RE2 = /\b(TODO|FIXME|HACK|PLACEHOLDER|XXX|TBD)\b/;
async function applyFixes(filePath, issues, options) {
  const dryRun = options?.dryRun ?? false;
  const fixedSet = /* @__PURE__ */ new Set();
  const skippedSet = /* @__PURE__ */ new Set();
  let content = readFileSync4(filePath, "utf8");
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
      if (TODO_RE2.test(line)) {
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
import { resolve as resolve4 } from "path";
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
      return { path: resolve4(cwd, "CLAUDE.md") };
    case "agents":
      return { path: resolve4(cwd, "AGENTS.md") };
    case "cursor":
      return {
        path: resolve4(cwd, ".cursor", "rules", "main.mdc"),
        dir: resolve4(cwd, ".cursor", "rules")
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
import { basename as basename4 } from "path";
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
  const file = basename4(result.file);
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
import { basename as basename5 } from "path";
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
  const fileLabel = isCrossFile ? "cross-file analysis" : basename5(result.file);
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
import { basename as basename6, relative } from "path";

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
  const base = basename6(filePath);
  if (/^claude\.md$/i.test(base)) return "CLAUDE.md";
  if (/^agents\.md$/i.test(base)) return "AGENTS.md";
  if (/^gemini\.md$/i.test(base)) return "GEMINI.md";
  if (base.endsWith(".mdc")) return ".mdc";
  if (base === "copilot-instructions.md") return "copilot-instructions.md";
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
    const rel = relative(root, r.file) || basename6(r.file);
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
        file: relative(root, r.file) || basename6(r.file),
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
import { extname as extname2, dirname, relative as relative2, resolve as resolve5 } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
var execFileAsync = promisify(execFile);
async function runHistory(filePath, config, n = 10) {
  const absPath = resolve5(process.cwd(), filePath);
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
  const isMdc = extname2(filePath).toLowerCase() === ".mdc";
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

// src/cli.ts
var program = new Command();
program.name("agent-doctor").description("Semantic health check for AI agent instruction files").version("0.8.0");
program.argument("[file]", "Path to the instruction file to analyse").option("--all", "Discover and analyse all instruction files in the project").option("--fail-on <severity>", "Exit with code 1 if any issue meets this severity", "critical").option("--format <format>", "Output format: text or json", "text").option("--structural-only", "Skip semantic layer (no API key required)").option(
  "--model <id>",
  "Override LLM model (e.g. gpt-4o uses OPENAI_API_KEY; claude-* uses ANTHROPIC_API_KEY)"
).option("--fix", "Auto-fix structural issues in-place (todo-in-instructions, unclosed-code-block, empty-section, missing-success-criteria)").option("--dry-run", "Preview --fix changes without writing to disk").option("--watch", "Re-run analysis on every file save \u2014 Ctrl+C to stop (single file only)").option("--init", "Scaffold a new agent instruction file template in the current directory").option("--type <type>", "Template type for --init: claude | cursor | agents", "claude").option("--force", "Overwrite existing files without prompting (use with --init)").option("--readiness-report", "Print a detailed per-dimension readiness breakdown instead of the standard issue list").option("--history [n]", "Show score trend for the last n git commits (default: 10)").option("--org [dir]", "Org-level health dashboard \u2014 recursively discovers all instruction files under dir (default: cwd)").option("--mcp", "Start MCP server mode (v0.2)").action(async (file, opts) => {
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
  if (opts.history !== void 0) {
    if (file === void 0) {
      process.stderr.write("--history requires a file argument, e.g.: agent-doctor CLAUDE.md --history\n");
      process.exit(2);
    }
    const cwd2 = process.cwd();
    const n = typeof opts.history === "string" ? Math.max(1, parseInt(opts.history, 10) || 10) : 10;
    const config2 = loadConfig(cwd2);
    try {
      const filePath = resolve6(cwd2, file);
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
    const orgRoot = typeof opts.org === "string" && opts.org.length > 0 ? resolve6(cwd2, opts.org) : cwd2;
    const config2 = loadConfig(cwd2);
    if (opts.model !== void 0 && opts.model.length > 0) config2.model = opts.model;
    config2.layers = ["structural"];
    if (opts.format !== "json") {
      process.stderr.write(chalk6.dim("\u2139  --org runs structural analysis only (no LLM cost)\n"));
    }
    const discovered = discoverOrgFiles(orgRoot);
    if (discovered.length === 0) {
      process.stdout.write(chalk6.yellow("No agent instruction files found.\n"));
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
    const filePath = resolve6(cwd, file);
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
    const found = candidates.find((c) => existsSync3(resolve6(cwd, c)));
    if (found === void 0) {
      program.help();
      process.exit(0);
    }
    try {
      results = [await analyse(resolve6(cwd, found), config)];
    } catch (err) {
      process.stderr.write(`Error analysing ${found}: ${String(err)}
`);
      process.exit(2);
    }
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
\u{1F441}  Watching ${basename7(watchTarget)} for changes\u2026 (Ctrl+C to stop)
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