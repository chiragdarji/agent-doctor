#!/usr/bin/env node

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

export {
  countTokens,
  parseSections
};
//# sourceMappingURL=chunk-N25LFLMI.js.map