import { z } from 'zod';
import { logger } from '../logger.js';
import { SEMANTIC_SYSTEM_PROMPT } from './semantic-prompt.js';
import { createClientFromConfig, resolveProvider } from './llm-client.js';
import type { LLMClient } from './llm-client.js';
import type { Config, Issue } from '../types.js';

// Re-export so existing tests that import AnthropicClient by name still compile.
export type { LLMClient as AnthropicClient } from './llm-client.js';

// ---------------------------------------------------------------------------
// Zod schema — validates Claude/OpenAI response before we trust it
// ---------------------------------------------------------------------------
const SEMANTIC_RULE_IDS = [
  'decision-loop',
  'contradiction',
  'vague-boundary',
  'tool-mismatch',
  'missing-fallback',
  'scope-bleed',
  'over-permissive',
  'ambiguous-pronoun',
] as const;

const IssueSchema = z.object({
  ruleId: z.enum(SEMANTIC_RULE_IDS),
  severity: z.enum(['critical', 'warning', 'suggestion']),
  message: z.string().min(1),
  suggestion: z.string().min(1),
  context: z.string().optional(),
  line: z.number().int().positive().optional(),
  relatedLine: z.number().int().positive().optional(),
});

const ResponseSchema = z.array(IssueSchema).max(8);

// ---------------------------------------------------------------------------
// JSON extraction — handles both bare arrays and markdown-fenced blocks
// ---------------------------------------------------------------------------

/**
 * Extracts a JSON string from a model response that may be wrapped in
 * markdown code fences or preceded/followed by prose.
 */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();

  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) return arrayMatch[0];

  return text.trim();
}

// ---------------------------------------------------------------------------
// Main semantic analyser
// ---------------------------------------------------------------------------

/**
 * Sends the instruction file content to the configured LLM and returns semantic issues.
 * Returns an empty array (without throwing) on any API or parsing failure.
 *
 * Provider selection:
 *  - Set ANTHROPIC_API_KEY to use Claude (default, any claude-* model)
 *  - Set OPENAI_API_KEY to use OpenAI (gpt-*, o1-*, o3-*, o4-* models)
 *  - Or set config.provider explicitly to override inference
 *
 * @param client - Optional LLMClient override (used in tests to inject a mock).
 */
export async function analyseSemantics(
  content: string,
  filePath: string,
  config: Config,
  client?: LLMClient,
): Promise<Issue[]> {
  // Resolve client: injected > factory > missing key
  const resolvedClient = client ?? createClientFromConfig(config);

  if (!resolvedClient) {
    const provider = resolveProvider(config);
    const envVar = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
    logger.warn(
      `${envVar} is not set — skipping semantic analysis. ` +
        `Run with --structural-only to suppress this warning.`,
    );
    return [];
  }

  let rawText: string;

  try {
    const response = await resolvedClient.complete({
      model: config.model,
      maxTokens: 2048,
      system: SEMANTIC_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content:
            `Analyse this agent instruction file for semantic issues.\n` +
            `File: ${filePath}\n\n` +
            `---\n${content}\n---`,
        },
      ],
    });
    rawText = response.text;
  } catch (err) {
    logger.error(`Semantic analysis API call failed: ${String(err)}`);
    return [];
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(rawText)) as unknown;
  } catch {
    logger.warn(`Semantic response is not valid JSON. Raw response:\n${rawText.slice(0, 200)}`);
    return [];
  }

  // Validate shape with Zod
  const validated = ResponseSchema.safeParse(parsed);
  if (!validated.success) {
    logger.warn(`Semantic response failed schema validation: ${JSON.stringify(validated.error.issues, null, 2)}`);
    return [];
  }

  logger.info(`Semantic analysis found ${validated.data.length.toString()} issue(s)`);
  return validated.data as Issue[];
}
