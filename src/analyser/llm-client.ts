import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { Config, LLMProvider } from '../types.js';

// ---------------------------------------------------------------------------
// Unified interface — both adapters satisfy this contract
// ---------------------------------------------------------------------------

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  text: string;
}

export interface LLMClient {
  complete(params: {
    model: string;
    system: string;
    messages: LLMMessage[];
    maxTokens: number;
  }): Promise<LLMResponse>;
}

// ---------------------------------------------------------------------------
// Provider inference
// ---------------------------------------------------------------------------

const OPENAI_MODEL_PREFIXES = ['gpt-', 'o1-', 'o3-', 'o4-'];

/**
 * Infers the LLM provider from a model name string.
 * Returns 'openai' for GPT/O-series models, 'anthropic' for everything else.
 */
export function inferProvider(model: string): LLMProvider {
  const lower = model.toLowerCase();
  return OPENAI_MODEL_PREFIXES.some((p) => lower.startsWith(p)) ? 'openai' : 'anthropic';
}

/**
 * Resolves the effective provider: uses config.provider if set,
 * otherwise infers from config.model.
 */
export function resolveProvider(config: Config): LLMProvider {
  return config.provider ?? inferProvider(config.model);
}

// ---------------------------------------------------------------------------
// Anthropic adapter
// ---------------------------------------------------------------------------

/**
 * Wraps the Anthropic Messages API in the unified LLMClient interface.
 */
export function createAnthropicClient(apiKey: string): LLMClient {
  const sdk = new Anthropic({ apiKey });
  return {
    async complete({ model, system, messages, maxTokens }) {
      const response = await sdk.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages,
      });
      const block = response.content[0];
      return { text: (block?.type === 'text' ? block.text : '') ?? '' };
    },
  };
}

// ---------------------------------------------------------------------------
// OpenAI adapter
// ---------------------------------------------------------------------------

/**
 * Wraps the OpenAI Chat Completions API in the unified LLMClient interface.
 * The system prompt is injected as the first message with role "system".
 */
export function createOpenAIClient(apiKey: string): LLMClient {
  const sdk = new OpenAI({ apiKey });
  return {
    async complete({ model, system, messages, maxTokens }) {
      const response = await sdk.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      });
      return { text: response.choices[0]?.message.content ?? '' };
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the appropriate LLMClient for the given config.
 * Returns null if the required API key is not set.
 */
export function createClientFromConfig(config: Config): LLMClient | null {
  const provider = resolveProvider(config);

  if (provider === 'openai') {
    const key = process.env['OPENAI_API_KEY'];
    if (!key) return null;
    return createOpenAIClient(key);
  }

  const key = process.env['ANTHROPIC_API_KEY'];
  if (!key) return null;
  return createAnthropicClient(key);
}
