#!/usr/bin/env node
import {
  countTokens,
  parseSections
} from "./chunk-N25LFLMI.js";

// src/parser/index.ts
import { extname, basename as basename2 } from "path";

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
function parseFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  const base = basename2(filePath);
  if (ext === ".mdc") return parseMdc(filePath);
  if (base === ".cursorrules") return parseMarkdown(filePath);
  if (base === ".windsurfrules") return parseMarkdown(filePath);
  if (ext === ".md") return parseMarkdown(filePath);
  return parseMarkdown(filePath);
}

export {
  parseMarkdown,
  parseMarkdownContent,
  parseMdc,
  parseMdcContent,
  parseFile
};
//# sourceMappingURL=chunk-XTBU7AIN.js.map