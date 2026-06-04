import { z } from 'zod';
import { logger } from '../logger.js';
import { CROSS_FILE_SYSTEM_PROMPT } from './semantic-prompt.js';
import { createClientFromConfig, resolveProvider } from './llm-client.js';
import type { LLMClient } from './llm-client.js';
import { extractJson } from './semantic.js';
import type { Config, Issue } from '../types.js';

export interface FileContent {
  filePath: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Zod schema — only cross-file-conflict is a valid ruleId here
// ---------------------------------------------------------------------------

const CrossFileIssueSchema = z.object({
  ruleId: z.literal('cross-file-conflict'),
  severity: z.enum(['critical', 'warning', 'suggestion']),
  message: z.string().min(1),
  suggestion: z.string().min(1),
  context: z.string().optional(),
});

const CrossFileResponseSchema = z.array(CrossFileIssueSchema).max(5);

// ---------------------------------------------------------------------------
// Main analyser
// ---------------------------------------------------------------------------

/**
 * Sends 2+ instruction file contents to the LLM together and returns any
 * cross-file conflicts found. Returns an empty array when fewer than 2 files
 * are provided or when no API key is available.
 *
 * @param files   - Array of `{ filePath, content }` objects (minimum 2).
 * @param config  - Analysis configuration (model, provider, etc.).
 * @param client  - Optional LLMClient override (used in tests to inject a mock).
 */
export async function multiFileSemantics(
  files: FileContent[],
  config: Config,
  client?: LLMClient,
): Promise<Issue[]> {
  if (files.length < 2) return [];

  const resolvedClient = client ?? createClientFromConfig(config);

  if (!resolvedClient) {
    const provider = resolveProvider(config);
    const envVar = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
    logger.warn(`${envVar} is not set — skipping cross-file semantic analysis.`);
    return [];
  }

  const fileBlocks = files
    .map((f) => `FILE: ${f.filePath}\n---\n${f.content}\n---`)
    .join('\n\n');

  let rawText: string;
  try {
    const response = await resolvedClient.complete({
      model: config.model,
      maxTokens: 1024,
      system: CROSS_FILE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Analyse these ${files.length.toString()} agent instruction files for cross-file conflicts:\n\n${fileBlocks}`,
        },
      ],
    });
    rawText = response.text;
  } catch (err) {
    logger.error(`Cross-file semantic analysis API call failed: ${String(err)}`);
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(rawText)) as unknown;
  } catch {
    logger.warn(
      `Cross-file semantic response is not valid JSON. Raw:\n${rawText.slice(0, 200)}`,
    );
    return [];
  }

  const validated = CrossFileResponseSchema.safeParse(parsed);
  if (!validated.success) {
    logger.warn(
      `Cross-file semantic response failed schema validation: ${JSON.stringify(validated.error.issues, null, 2)}`,
    );
    return [];
  }

  logger.info(`Cross-file analysis found ${validated.data.length.toString()} conflict(s)`);
  return validated.data as Issue[];
}
