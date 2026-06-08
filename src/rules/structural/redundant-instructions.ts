import type { Issue, StructuralRule } from '../../types.js';

/** Minimum normalised length before a directive is considered for dedup checking. */
const MIN_DIRECTIVE_LENGTH = 20;

/** Number of near-duplicate occurrences required to flag. */
const DUPLICATE_THRESHOLD = 3;

/**
 * Normalises a line for fuzzy comparison:
 * - lowercase
 * - strip leading bullet/numbering
 * - collapse whitespace
 * - strip punctuation
 */
function normalise(line: string): string {
  return line
    .toLowerCase()
    .replace(/^[-*\d.)\s]+/, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns true if two normalised strings are "close enough" to be considered duplicates.
 * Uses a simple word-overlap ratio (Jaccard-like): intersection / union >= 0.75.
 */
function areSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  const wordsA = new Set(a.split(' ').filter((w) => w.length > 3));
  const wordsB = new Set(b.split(' ').filter((w) => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  let intersection = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersection++;
  const union = wordsA.size + wordsB.size - intersection;
  return intersection / union >= 0.75;
}

/**
 * Flags directives that appear 3 or more times across the instruction file.
 *
 * Repeated instructions bloat the file, consume token budget, and may signal
 * conflicting edits from multiple authors. Agents don't weight repetition
 * more heavily — only the first occurrence is typically actionable.
 */
export const redundantInstructions: StructuralRule = (
  content: string,
  _filePath: string,
): Issue[] => {
  const lines = content.split('\n');
  const issues: Issue[] = [];
  let inCodeBlock = false;

  // Collect candidate directives (bullet points and standalone sentences)
  const directives: Array<{ norm: string; raw: string; line: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    if (/^```|^~~~/.test(raw.trim())) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const norm = normalise(raw);
    if (norm.length >= MIN_DIRECTIVE_LENGTH) {
      directives.push({ norm, raw: raw.trim(), line: i + 1 });
    }
  }

  // Find clusters of near-duplicates
  const reported = new Set<number>();

  for (let i = 0; i < directives.length; i++) {
    if (reported.has(i)) continue;
    const cluster: number[] = [i];

    for (let j = i + 1; j < directives.length; j++) {
      if (reported.has(j)) continue;
      if (areSimilar(directives[i]!.norm, directives[j]!.norm)) {
        cluster.push(j);
      }
    }

    if (cluster.length >= DUPLICATE_THRESHOLD) {
      for (const idx of cluster) reported.add(idx);
      const first = directives[i]!;
      const lines_str = cluster.map((idx) => directives[idx]!.line).join(', ');
      issues.push({
        ruleId: 'redundant-instructions',
        severity: 'warning',
        message: `Directive repeated ${cluster.length} times (lines ${lines_str}): "${first.raw.slice(0, 60)}${first.raw.length > 60 ? '…' : ''}"`,
        suggestion:
          'Keep one authoritative occurrence and remove the duplicates to reduce token usage and avoid confusion',
        line: first.line,
        context: first.raw.slice(0, 80),
      });
    }
  }

  return issues;
};
