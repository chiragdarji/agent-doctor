import { parseSections } from '../../parser/sections.js';
import type { Issue, StructuralRule } from '../../types.js';

// Phrases that indicate the file references tool usage
const TOOL_REFERENCE_RE =
  /\b(you have access to|use the .{1,40} tool|call(ing)? the .{1,40} (tool|function|api)|invoke|available tool[s]?|the following tool[s]?)\b/i;

// Section headings that enumerate tools (capabilit\w* matches capability/capabilities)
const TOOL_SECTION_RE = /(tool|capabilit\w*|available|command|function|action)/i;

/**
 * Flags instruction files that reference tools without providing a section that
 * enumerates the tools available to the agent.
 *
 * Agents need an explicit list of available tools to plan actions correctly.
 * Without enumeration they may attempt to call non-existent tools or miss capabilities.
 * Maps to the "Tooled" dimension of the Factory.ai Agent Readiness framework.
 */
export const missingToolList: StructuralRule = (content: string, _filePath: string): Issue[] => {
  // Only fire if the file actually references tool usage
  if (!TOOL_REFERENCE_RE.test(content)) return [];

  const sections = parseSections(content);
  const hasToolSection = sections.some((s) => TOOL_SECTION_RE.test(s.heading));

  if (hasToolSection) return [];

  return [
    {
      ruleId: 'missing-tool-list',
      severity: 'suggestion',
      message:
        'File references tool usage but has no section enumerating the available tools',
      suggestion:
        'Add a "## Available Tools" section listing each tool with its name, purpose, and key parameters',
    },
  ];
};
