/**
 * agent-doctor MCP server.
 *
 * Exposes two tools:
 *   analyse_agent_file  — full structural + semantic health check
 *   suggest_fix         — targeted fix suggestion for a specific rule
 *
 * API keys can be passed directly as tool inputs so callers never need to
 * pre-configure environment variables. Environment variables are used as
 * fallback when tool inputs omit them.
 *
 * Usage (Claude Code .claude/settings.json):
 * {
 *   "mcpServers": {
 *     "agent-doctor": {
 *       "command": "npx",
 *       "args": ["@chiragdarji/agent-doctor", "--mcp"]
 *     }
 *   }
 * }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyse, analyseCrossFile, computeReadiness } from './analyser/index.js';
import { analyseSemantics } from './analyser/semantic.js';
import {
  createAnthropicClient,
  createOpenAIClient,
  createOpenAICompatibleClient,
  inferProvider,
} from './analyser/llm-client.js';
import { loadConfig } from './config.js';
import { parseFile } from './parser/index.js';
import { multiFileSemantics } from './analyser/multi-file-semantic.js';
import { runStructuralAnalysis } from './analyser/structural.js';
import { formatResultJson } from './output/formatter.js';
import type { LLMClient } from './analyser/llm-client.js';
import type { AnalysisResult, Config, RuleId, Severity } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves an LLMClient from explicit key params, falling back to env vars.
 * Handles anthropic, openai, and openai-compatible (Ollama / local LLMs).
 * Returns null if no API key / baseURL is available.
 */
function resolveClient(
  config: Config,
  anthropicApiKey?: string,
  openaiApiKey?: string,
): LLMClient | null {
  const provider = config.provider ?? inferProvider(config.model);

  if (provider === 'openai-compatible') {
    if (!config.baseURL) return null;
    const key = openaiApiKey ?? process.env['OPENAI_API_KEY'] ?? 'ollama';
    return createOpenAICompatibleClient(config.baseURL, key);
  }

  if (provider === 'openai') {
    const key = openaiApiKey ?? process.env['OPENAI_API_KEY'];
    return key ? createOpenAIClient(key) : null;
  }

  const key = anthropicApiKey ?? process.env['ANTHROPIC_API_KEY'];
  return key ? createAnthropicClient(key) : null;
}

/** Builds the severity deduction score from issues. */
function calcScore(issues: AnalysisResult['issues']): number {
  const deductions: Record<Severity, number> = { critical: 20, warning: 10, suggestion: 3 };
  return Math.max(0, 100 - issues.reduce((a, i) => a + deductions[i.severity], 0));
}

/** Formats a structured MCP error response. */
function errorText(msg: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text' as const, text: `ERROR: ${msg}` }] };
}

/** Extracts a string argument safely from MCP args. */
function strArg(args: unknown, key: string): string | undefined {
  if (args !== null && typeof args === 'object' && key in (args)) {
    const val = (args as Record<string, unknown>)[key];
    if (typeof val === 'string' && val.length > 0) return val;
  }
  return undefined;
}

/** Extracts a string[] argument safely from MCP args. Returns [] if absent. */
function strArrayArg(args: unknown, key: string): string[] {
  if (args !== null && typeof args === 'object' && key in (args as object)) {
    const val = (args as Record<string, unknown>)[key];
    if (Array.isArray(val)) {
      return val.filter((v): v is string => typeof v === 'string' && v.length > 0);
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'agent-doctor', version: '0.4.0' },
  { capabilities: { tools: {} } },
);

// ---------------------------------------------------------------------------
// tools/list
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: 'analyse_agent_file',
      description:
        'Run agent-doctor on one or more AI instruction files (CLAUDE.md, AGENTS.md, .mdc, GEMINI.md, etc.) ' +
        'and return a full health report with score, grade, and all issues found. ' +
        'When multiple files are provided via filePaths, cross-file conflict detection also runs. ' +
        'Pass anthropicApiKey or openaiApiKey to enable semantic (LLM) analysis.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          filePath: {
            type: 'string',
            description: 'Absolute or relative path to a single instruction file to analyse',
          },
          filePaths: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Absolute or relative paths to multiple instruction files. ' +
              'When 2+ files are provided with semantic layer enabled, cross-file conflict detection runs.',
          },
          layers: {
            type: 'array',
            items: { type: 'string', enum: ['structural', 'semantic'] },
            description:
              'Layers to run. Default: both. Use ["structural"] to skip LLM call (no API key needed).',
          },
          model: {
            type: 'string',
            description:
              'LLM model for semantic analysis (e.g. claude-sonnet-4-6, gpt-4o). ' +
              'Provider inferred from name: gpt-*/o1-*/o3-*/o4-* → OpenAI, else Anthropic.',
          },
          anthropicApiKey: {
            type: 'string',
            description:
              'Anthropic API key for Claude models. Falls back to ANTHROPIC_API_KEY env var.',
          },
          openaiApiKey: {
            type: 'string',
            description:
              'OpenAI API key for gpt-* / o-series models. Falls back to OPENAI_API_KEY env var.',
          },
        },
        required: [],
      },
    },
    {
      name: 'suggest_fix',
      description:
        'Get a concrete, actionable fix for a specific agent-doctor rule violation. ' +
        'Returns the built-in suggestion plus an LLM-generated rewrite of the offending section ' +
        'when an API key is provided.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          filePath: {
            type: 'string',
            description: 'Absolute or relative path to the instruction file',
          },
          issueRuleId: {
            type: 'string',
            description:
              'The ruleId to fix (e.g. decision-loop, empty-section, todo-in-instructions)',
          },
          model: {
            type: 'string',
            description: 'LLM model for generating the rewrite (optional).',
          },
          anthropicApiKey: {
            type: 'string',
            description: 'Anthropic API key. Falls back to ANTHROPIC_API_KEY env var.',
          },
          openaiApiKey: {
            type: 'string',
            description: 'OpenAI API key. Falls back to OPENAI_API_KEY env var.',
          },
        },
        required: ['filePath', 'issueRuleId'],
      },
    },
  ],
}));

// ---------------------------------------------------------------------------
// tools/call
// ---------------------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // ── analyse_agent_file ────────────────────────────────────────────────────
  if (name === 'analyse_agent_file') {
    // Support both filePath (single) and filePaths (multiple)
    const singlePath = strArg(args, 'filePath');
    const multiplePaths = strArrayArg(args, 'filePaths');
    const rawPaths: string[] =
      multiplePaths.length > 0
        ? multiplePaths
        : singlePath !== undefined
          ? [singlePath]
          : [];

    if (rawPaths.length === 0) {
      return errorText('filePath or filePaths is required');
    }

    const cwd = process.cwd();
    const filePaths = rawPaths.map((p) => resolve(cwd, p));

    for (const fp of filePaths) {
      if (!existsSync(fp)) return errorText(`File not found: ${fp}`);
    }

    try {
      const config = loadConfig(cwd);

      // Model override
      const model = strArg(args, 'model');
      if (model) config.model = model;

      // Layer override
      if (
        args !== null &&
        typeof args === 'object' &&
        'layers' in (args as object) &&
        Array.isArray((args as Record<string, unknown>)['layers'])
      ) {
        config.layers = (args as Record<string, unknown>)['layers'] as (
          | 'structural'
          | 'semantic'
        )[];
      }

      // Resolve LLM client from tool inputs or env
      const semanticRequested = config.layers.includes('semantic');
      const client = semanticRequested
        ? resolveClient(config, strArg(args, 'anthropicApiKey'), strArg(args, 'openaiApiKey'))
        : null;

      // Downgrade to structural-only when semantic is requested but no key available
      let semanticSkipped = false;
      if (semanticRequested && client === null) {
        config.layers = ['structural'];
        semanticSkipped = true;
      }

      // Per-file analysis
      const results: AnalysisResult[] = [];
      for (const filePath of filePaths) {
        let result: AnalysisResult;
        if (client !== null) {
          const parsed = parseFile(filePath);
          const structuralIssues = config.layers.includes('structural')
            ? runStructuralAnalysis(parsed, config)
            : [];
          const semanticIssues = await analyseSemantics(
            parsed.content,
            filePath,
            config,
            client,
          );
          const filtered = semanticIssues.filter((i) => config.rules[i.ruleId] !== 'off');
          const allIssues = [...structuralIssues, ...filtered];
          const score = calcScore(allIssues);
          const grade =
            score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
          const { readinessScore, readinessDimensions } = computeReadiness(allIssues);
          result = {
            file: filePath,
            score,
            grade,
            issues: allIssues,
            tokenCount: parsed.tokenCount,
            analysedAt: new Date().toISOString(),
            layers: config.layers,
            readinessScore,
            readinessDimensions,
          };
        } else {
          result = await analyse(filePath, config);
        }
        results.push(result);
      }

      // Cross-file conflict detection when 2+ files analysed with semantic layer
      if (filePaths.length >= 2 && !semanticSkipped && client !== null) {
        const fileContents = filePaths.map((fp) => {
          const parsed = parseFile(fp);
          return { filePath: fp, content: parsed.content };
        });
        const crossIssues = await multiFileSemantics(fileContents, config, client);
        const filtered = crossIssues.filter((i) => config.rules[i.ruleId] !== 'off');
        if (filtered.length > 0) {
          const crossScore = calcScore(filtered);
          const { readinessScore, readinessDimensions } = computeReadiness(filtered);
          results.push({
            file: '<cross-file-analysis>',
            score: crossScore,
            grade: crossScore >= 90 ? 'A' : crossScore >= 75 ? 'B' : crossScore >= 60 ? 'C' : crossScore >= 40 ? 'D' : 'F',
            issues: filtered,
            tokenCount: 0,
            analysedAt: new Date().toISOString(),
            layers: ['semantic'],
            readinessScore,
            readinessDimensions,
          });
        }
      }

      // Build summary text
      const sections: string[] = [`# agent-doctor report`];

      for (const result of results) {
        const isCrossFile = result.file === '<cross-file-analysis>';
        const criticals = result.issues.filter((i) => i.severity === 'critical');
        const warnings = result.issues.filter((i) => i.severity === 'warning');
        const suggestions = result.issues.filter((i) => i.severity === 'suggestion');

        const issueLines =
          result.issues.length === 0
            ? ['✅ No issues found — this file is healthy.']
            : result.issues.map(
                (i) =>
                  `### [${i.severity.toUpperCase()}] \`${i.ruleId}\`${i.line ? ` — line ${i.line}` : ''}\n` +
                  `**Issue:** ${i.message}\n` +
                  `**Fix:** ${i.suggestion}` +
                  (i.context ? `\n\`\`\`\n${i.context}\n\`\`\`` : ''),
              );

        const rd = result.readinessDimensions;
        sections.push(
          [
            `---`,
            isCrossFile
              ? `## Cross-file conflict analysis`
              : `## \`${result.file}\``,
            `**Score:** ${result.score}/100  **Grade:** ${result.grade}`,
            isCrossFile
              ? ''
              : `**Readiness:** ${result.readinessScore}/100  (obs:${rd.observable} bnd:${rd.bounded} rev:${rd.reversible} tld:${rd.tooled} doc:${rd.documented})`,
            `**Issues:** ${criticals.length} critical · ${warnings.length} warnings · ${suggestions.length} suggestions`,
            '',
            ...issueLines,
          ]
            .filter((l) => l !== undefined)
            .join('\n'),
        );
      }

      if (semanticSkipped) {
        sections.push(
          '> ⚠️ **semantic_skipped:** No API key provided — structural analysis only.\n' +
            '> Pass `anthropicApiKey`, `openaiApiKey`, or set `provider: "openai-compatible"` with `baseURL` for full analysis.',
        );
      }

      return { content: [{ type: 'text' as const, text: sections.join('\n') }] };
    } catch (err) {
      return errorText(`Analysis failed: ${String(err)}`);
    }
  }

  // ── suggest_fix ───────────────────────────────────────────────────────────
  if (name === 'suggest_fix') {
    const rawPath = strArg(args, 'filePath') ?? '';
    const filePath = resolve(process.cwd(), rawPath);
    const issueRuleId = (strArg(args, 'issueRuleId') ?? '') as RuleId;

    if (!existsSync(filePath)) {
      return errorText(`File not found: ${filePath}`);
    }

    if (!issueRuleId) {
      return errorText('issueRuleId is required');
    }

    try {
      const config = loadConfig(process.cwd());
      const model = strArg(args, 'model');
      if (model) config.model = model;

      const client = resolveClient(
        config,
        strArg(args, 'anthropicApiKey'),
        strArg(args, 'openaiApiKey'),
      );

      // Find the issue via structural analysis
      const parsed = parseFile(filePath);
      const structuralIssues = runStructuralAnalysis(parsed, config);
      const issue = structuralIssues.find((i) => i.ruleId === issueRuleId);

      if (!issue) {
        return errorText(
          `Rule "${issueRuleId}" did not fire on ${filePath}. ` +
            `Run analyse_agent_file first to see which rules are active.`,
        );
      }

      const baseFix = [
        `## Fix for \`${issueRuleId}\``,
        `**File:** \`${filePath}\``,
        issue.line ? `**Line:** ${issue.line}` : '',
        '',
        `**Issue:** ${issue.message}`,
        `**Suggestion:** ${issue.suggestion}`,
        issue.context ? `\n**Offending text:**\n\`\`\`\n${issue.context}\n\`\`\`` : '',
      ]
        .filter(Boolean)
        .join('\n');

      // LLM rewrite if a client is available
      if (client) {
        const snippet = parsed.rawContent.slice(0, 3000);
        const prompt =
          `You are an expert at writing AI agent instruction files (CLAUDE.md, AGENTS.md, Cursor .mdc rules).\n\n` +
          `The file "${filePath}" has this structural issue:\n` +
          `Rule ID: ${issueRuleId}\n` +
          `Issue: ${issue.message}\n` +
          `Suggestion: ${issue.suggestion}\n` +
          (issue.context ? `Offending text:\n${issue.context}\n\n` : '') +
          `File content (first 3000 chars):\n${snippet}\n\n` +
          `Provide a concrete rewrite of ONLY the offending part to fix this issue. ` +
          `Be specific. Show the before and after.`;

        try {
          const response = await client.complete({
            model: config.model,
            system:
              'You are an expert AI agent instruction file reviewer. ' +
              'Return a concise before/after showing exactly how to fix the issue.',
            messages: [{ role: 'user', content: prompt }],
            maxTokens: 600,
          });

          return {
            content: [
              {
                type: 'text' as const,
                text: `${baseFix}\n\n---\n\n## LLM-generated rewrite\n\n${response.text}`,
              },
            ],
          };
        } catch {
          // LLM unavailable — return structural suggestion only
        }
      }

      return { content: [{ type: 'text' as const, text: baseFix }] };
    } catch (err) {
      return errorText(`suggest_fix failed: ${String(err)}`);
    }
  }

  return errorText(`Unknown tool: "${name}"`);
});

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
