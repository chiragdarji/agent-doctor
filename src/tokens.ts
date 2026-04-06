import { get_encoding } from 'tiktoken';

let _enc: ReturnType<typeof get_encoding> | null = null;

function getEncoder(): ReturnType<typeof get_encoding> {
  if (!_enc) {
    _enc = get_encoding('cl100k_base');
  }
  return _enc;
}

/**
 * Counts the approximate number of tokens in a string using cl100k_base encoding.
 * Falls back to a character-based approximation if tiktoken is unavailable.
 */
export function countTokens(text: string): number {
  try {
    return getEncoder().encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}
