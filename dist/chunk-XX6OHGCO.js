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
import { readFileSync } from "fs";
import { basename } from "path";
import { load as yamlLoad } from "js-yaml";
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
  if (/^\.windsurfrules$/i.test(base)) return "windsurf-rules";
  if (/\.roo\/rules\//i.test(normalised) && base.endsWith(".md")) return "roo-rule";
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
import { extname, basename as basename2 } from "path";
function parseFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  const base = basename2(filePath);
  if (ext === ".mdc") return parseMdc(filePath);
  if (base === ".cursorrules") return parseMarkdown(filePath);
  if (base === ".windsurfrules") return parseMarkdown(filePath);
  if (ext === ".md") return parseMarkdown(filePath);
  return parseMarkdown(filePath);
}

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
import { readFileSync as readFileSync3 } from "fs";
import { resolve as resolve2 } from "path";
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

export {
  countTokens,
  parseSections,
  parseMarkdown,
  parseMarkdownContent,
  parseMdc,
  parseMdcContent,
  parseFile,
  detectPlatform,
  applyPlatformOverrides,
  runStructuralAnalysis,
  inferProvider,
  resolveProvider,
  createOpenAICompatibleClient,
  createAnthropicClient,
  createOpenAIClient,
  createClientFromConfig,
  analyseSemantics,
  multiFileSemantics,
  loadPlugins,
  analyse,
  analyseAll,
  calculateScore,
  calculateGrade,
  computeReadiness,
  DEFAULT_CONFIG,
  loadConfig
};
//# sourceMappingURL=chunk-XX6OHGCO.js.map