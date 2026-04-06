import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { logger } from '../logger.js';
import { SEMANTIC_SYSTEM_PROMPT } from './semantic-prompt.js';
import type { Config, Issue } from '../types.js';

/** Minimal interface for the Anthropic client used by analyseSemantics — injectable for testing. */
export interface AnthropicClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    }): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

// ---------------------------------------------------------------------------
// Zod schema — validates Claude's response before we trust it
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
 * Extracts a JSON string from a Claude response that may be wrapped in
 * markdown code fences or preceded/followed by prose.
 */
export function extractJson(text: string): string {
  // ```json ... ``` or ``` ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();

  // Bare JSON array anywhere in the text
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) return arrayMatch[0];

  return text.trim();
}

// ---------------------------------------------------------------------------
// Main semantic analyser
// ---------------------------------------------------------------------------

/**
 * Sends the instruction file content to Claude and returns semantic issues.
 * Returns an empty array (without throwing) on any API or parsing failure.
 * Requires ANTHROPIC_API_KEY to be set; logs a warning and returns [] if not.
 *
 * @param client - Optional Anthropic client override (used in tests to inject a mock).
 */
export async function analyseSemantics(
  content: string,
  filePath: string,
  config: Config,
  client?: AnthropicClient,
): Promise<Issue[]> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];

  if (!client) {
    if (!apiKey) {
      logger.warn(
        'ANTHROPIC_API_KEY is not set — skipping semantic analysis. ' +
          'Run with --structural-only to suppress this warning.',
      );
      return [];
    }
    client = new Anthropic({ apiKey });
  }

  let rawText: string;

  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 2048,
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

    const block = response.content[0];
    if (!block || block.type !== 'text') {
      logger.warn('Unexpected response structure from Claude API — no text block');
      return [];
    }

    rawText = block.text ?? '';
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
    logger.warn(`Semantic response failed schema validation: ${validated.error.message}`);
    return [];
  }

  logger.info(`Semantic analysis found ${validated.data.length.toString()} issue(s)`);
  return validated.data as Issue[];
}
