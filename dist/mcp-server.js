import {
  analyse,
  analyseSemantics,
  computeReadiness,
  createAnthropicClient,
  createOpenAIClient,
  createOpenAICompatibleClient,
  inferProvider,
  loadConfig,
  multiFileSemantics,
  parseFile,
  runStructuralAnalysis
} from "./chunk-DMRYU6SC.js";

// src/mcp-server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { existsSync } from "fs";
import { resolve } from "path";
function resolveClient(config, anthropicApiKey, openaiApiKey) {
  const provider = config.provider ?? inferProvider(config.model);
  if (provider === "openai-compatible") {
    if (!config.baseURL) return null;
    const key2 = openaiApiKey ?? process.env["OPENAI_API_KEY"] ?? "ollama";
    return createOpenAICompatibleClient(config.baseURL, key2);
  }
  if (provider === "openai") {
    const key2 = openaiApiKey ?? process.env["OPENAI_API_KEY"];
    return key2 ? createOpenAIClient(key2) : null;
  }
  const key = anthropicApiKey ?? process.env["ANTHROPIC_API_KEY"];
  return key ? createAnthropicClient(key) : null;
}
function calcScore(issues) {
  const deductions = { critical: 20, warning: 10, suggestion: 3 };
  return Math.max(0, 100 - issues.reduce((a, i) => a + deductions[i.severity], 0));
}
function errorText(msg) {
  return { content: [{ type: "text", text: `ERROR: ${msg}` }] };
}
function strArg(args, key) {
  if (args !== null && typeof args === "object" && key in args) {
    const val = args[key];
    if (typeof val === "string" && val.length > 0) return val;
  }
  return void 0;
}
function strArrayArg(args, key) {
  if (args !== null && typeof args === "object" && key in args) {
    const val = args[key];
    if (Array.isArray(val)) {
      return val.filter((v) => typeof v === "string" && v.length > 0);
    }
  }
  return [];
}
var server = new Server(
  { name: "agent-doctor", version: "0.4.0" },
  { capabilities: { tools: {} } }
);
server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: "analyse_agent_file",
      description: "Run agent-doctor on one or more AI instruction files (CLAUDE.md, AGENTS.md, .mdc, GEMINI.md, etc.) and return a full health report with score, grade, and all issues found. When multiple files are provided via filePaths, cross-file conflict detection also runs. Pass anthropicApiKey or openaiApiKey to enable semantic (LLM) analysis.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Absolute or relative path to a single instruction file to analyse"
          },
          filePaths: {
            type: "array",
            items: { type: "string" },
            description: "Absolute or relative paths to multiple instruction files. When 2+ files are provided with semantic layer enabled, cross-file conflict detection runs."
          },
          layers: {
            type: "array",
            items: { type: "string", enum: ["structural", "semantic"] },
            description: 'Layers to run. Default: both. Use ["structural"] to skip LLM call (no API key needed).'
          },
          model: {
            type: "string",
            description: "LLM model for semantic analysis (e.g. claude-sonnet-4-6, gpt-4o). Provider inferred from name: gpt-*/o1-*/o3-*/o4-* \u2192 OpenAI, else Anthropic."
          },
          anthropicApiKey: {
            type: "string",
            description: "Anthropic API key for Claude models. Falls back to ANTHROPIC_API_KEY env var."
          },
          openaiApiKey: {
            type: "string",
            description: "OpenAI API key for gpt-* / o-series models. Falls back to OPENAI_API_KEY env var."
          }
        },
        required: []
      }
    },
    {
      name: "suggest_fix",
      description: "Get a concrete, actionable fix for a specific agent-doctor rule violation. Returns the built-in suggestion plus an LLM-generated rewrite of the offending section when an API key is provided.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Absolute or relative path to the instruction file"
          },
          issueRuleId: {
            type: "string",
            description: "The ruleId to fix (e.g. decision-loop, empty-section, todo-in-instructions)"
          },
          model: {
            type: "string",
            description: "LLM model for generating the rewrite (optional)."
          },
          anthropicApiKey: {
            type: "string",
            description: "Anthropic API key. Falls back to ANTHROPIC_API_KEY env var."
          },
          openaiApiKey: {
            type: "string",
            description: "OpenAI API key. Falls back to OPENAI_API_KEY env var."
          }
        },
        required: ["filePath", "issueRuleId"]
      }
    }
  ]
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name === "analyse_agent_file") {
    const singlePath = strArg(args, "filePath");
    const multiplePaths = strArrayArg(args, "filePaths");
    const rawPaths = multiplePaths.length > 0 ? multiplePaths : singlePath !== void 0 ? [singlePath] : [];
    if (rawPaths.length === 0) {
      return errorText("filePath or filePaths is required");
    }
    const cwd = process.cwd();
    const filePaths = rawPaths.map((p) => resolve(cwd, p));
    for (const fp of filePaths) {
      if (!existsSync(fp)) return errorText(`File not found: ${fp}`);
    }
    try {
      const config = loadConfig(cwd);
      const model = strArg(args, "model");
      if (model) config.model = model;
      if (args !== null && typeof args === "object" && "layers" in args && Array.isArray(args["layers"])) {
        config.layers = args["layers"];
      }
      const semanticRequested = config.layers.includes("semantic");
      const client = semanticRequested ? resolveClient(config, strArg(args, "anthropicApiKey"), strArg(args, "openaiApiKey")) : null;
      let semanticSkipped = false;
      if (semanticRequested && client === null) {
        config.layers = ["structural"];
        semanticSkipped = true;
      }
      const results = [];
      for (const filePath of filePaths) {
        let result;
        if (client !== null) {
          const parsed = parseFile(filePath);
          const structuralIssues = config.layers.includes("structural") ? runStructuralAnalysis(parsed, config) : [];
          const semanticIssues = await analyseSemantics(
            parsed.content,
            filePath,
            config,
            client
          );
          const filtered = semanticIssues.filter((i) => config.rules[i.ruleId] !== "off");
          const allIssues = [...structuralIssues, ...filtered];
          const score = calcScore(allIssues);
          const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
          const { readinessScore, readinessDimensions } = computeReadiness(allIssues);
          result = {
            file: filePath,
            score,
            grade,
            issues: allIssues,
            tokenCount: parsed.tokenCount,
            analysedAt: (/* @__PURE__ */ new Date()).toISOString(),
            layers: config.layers,
            readinessScore,
            readinessDimensions
          };
        } else {
          result = await analyse(filePath, config);
        }
        results.push(result);
      }
      if (filePaths.length >= 2 && !semanticSkipped && client !== null) {
        const fileContents = filePaths.map((fp) => {
          const parsed = parseFile(fp);
          return { filePath: fp, content: parsed.content };
        });
        const crossIssues = await multiFileSemantics(fileContents, config, client);
        const filtered = crossIssues.filter((i) => config.rules[i.ruleId] !== "off");
        if (filtered.length > 0) {
          const crossScore = calcScore(filtered);
          const { readinessScore, readinessDimensions } = computeReadiness(filtered);
          results.push({
            file: "<cross-file-analysis>",
            score: crossScore,
            grade: crossScore >= 90 ? "A" : crossScore >= 75 ? "B" : crossScore >= 60 ? "C" : crossScore >= 40 ? "D" : "F",
            issues: filtered,
            tokenCount: 0,
            analysedAt: (/* @__PURE__ */ new Date()).toISOString(),
            layers: ["semantic"],
            readinessScore,
            readinessDimensions
          });
        }
      }
      const sections = [`# agent-doctor report`];
      for (const result of results) {
        const isCrossFile = result.file === "<cross-file-analysis>";
        const criticals = result.issues.filter((i) => i.severity === "critical");
        const warnings = result.issues.filter((i) => i.severity === "warning");
        const suggestions = result.issues.filter((i) => i.severity === "suggestion");
        const issueLines = result.issues.length === 0 ? ["\u2705 No issues found \u2014 this file is healthy."] : result.issues.map(
          (i) => `### [${i.severity.toUpperCase()}] \`${i.ruleId}\`${i.line ? ` \u2014 line ${i.line}` : ""}
**Issue:** ${i.message}
**Fix:** ${i.suggestion}` + (i.context ? `
\`\`\`
${i.context}
\`\`\`` : "")
        );
        const rd = result.readinessDimensions;
        sections.push(
          [
            `---`,
            isCrossFile ? `## Cross-file conflict analysis` : `## \`${result.file}\``,
            `**Score:** ${result.score}/100  **Grade:** ${result.grade}`,
            isCrossFile ? "" : `**Readiness:** ${result.readinessScore}/100  (obs:${rd.observable} bnd:${rd.bounded} rev:${rd.reversible} tld:${rd.tooled} doc:${rd.documented})`,
            `**Issues:** ${criticals.length} critical \xB7 ${warnings.length} warnings \xB7 ${suggestions.length} suggestions`,
            "",
            ...issueLines
          ].filter((l) => l !== void 0).join("\n")
        );
      }
      if (semanticSkipped) {
        sections.push(
          '> \u26A0\uFE0F **semantic_skipped:** No API key provided \u2014 structural analysis only.\n> Pass `anthropicApiKey`, `openaiApiKey`, or set `provider: "openai-compatible"` with `baseURL` for full analysis.'
        );
      }
      return { content: [{ type: "text", text: sections.join("\n") }] };
    } catch (err) {
      return errorText(`Analysis failed: ${String(err)}`);
    }
  }
  if (name === "suggest_fix") {
    const rawPath = strArg(args, "filePath") ?? "";
    const filePath = resolve(process.cwd(), rawPath);
    const issueRuleId = strArg(args, "issueRuleId") ?? "";
    if (!existsSync(filePath)) {
      return errorText(`File not found: ${filePath}`);
    }
    if (!issueRuleId) {
      return errorText("issueRuleId is required");
    }
    try {
      const config = loadConfig(process.cwd());
      const model = strArg(args, "model");
      if (model) config.model = model;
      const client = resolveClient(
        config,
        strArg(args, "anthropicApiKey"),
        strArg(args, "openaiApiKey")
      );
      const parsed = parseFile(filePath);
      const structuralIssues = runStructuralAnalysis(parsed, config);
      const issue = structuralIssues.find((i) => i.ruleId === issueRuleId);
      if (!issue) {
        return errorText(
          `Rule "${issueRuleId}" did not fire on ${filePath}. Run analyse_agent_file first to see which rules are active.`
        );
      }
      const baseFix = [
        `## Fix for \`${issueRuleId}\``,
        `**File:** \`${filePath}\``,
        issue.line ? `**Line:** ${issue.line}` : "",
        "",
        `**Issue:** ${issue.message}`,
        `**Suggestion:** ${issue.suggestion}`,
        issue.context ? `
**Offending text:**
\`\`\`
${issue.context}
\`\`\`` : ""
      ].filter(Boolean).join("\n");
      if (client) {
        const snippet = parsed.rawContent.slice(0, 3e3);
        const prompt = `You are an expert at writing AI agent instruction files (CLAUDE.md, AGENTS.md, Cursor .mdc rules).

The file "${filePath}" has this structural issue:
Rule ID: ${issueRuleId}
Issue: ${issue.message}
Suggestion: ${issue.suggestion}
` + (issue.context ? `Offending text:
${issue.context}

` : "") + `File content (first 3000 chars):
${snippet}

Provide a concrete rewrite of ONLY the offending part to fix this issue. Be specific. Show the before and after.`;
        try {
          const response = await client.complete({
            model: config.model,
            system: "You are an expert AI agent instruction file reviewer. Return a concise before/after showing exactly how to fix the issue.",
            messages: [{ role: "user", content: prompt }],
            maxTokens: 600
          });
          return {
            content: [
              {
                type: "text",
                text: `${baseFix}

---

## LLM-generated rewrite

${response.text}`
              }
            ]
          };
        } catch {
        }
      }
      return { content: [{ type: "text", text: baseFix }] };
    } catch (err) {
      return errorText(`suggest_fix failed: ${String(err)}`);
    }
  }
  return errorText(`Unknown tool: "${name}"`);
});
var transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=mcp-server.js.map