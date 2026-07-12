/** Shared tokenized-matching helpers so every search segment treats multi-word queries the same way. */

export const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MAX_TOKENS = 6;

/** Lowercases, collapses whitespace, splits into unique words, capped to bound query cost. */
export function tokenize(query: string, maxTokens: number = MAX_TOKENS): string[] {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return [];
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const word of normalized.split(' ')) {
    if (!word || seen.has(word)) continue;
    seen.add(word);
    tokens.push(word);
    if (tokens.length >= maxTokens) break;
  }
  return tokens;
}

/**
 * Builds a Mongo filter requiring every token to appear (word-boundary prefix, case-insensitive)
 * in at least one of `fields` — different tokens may match different fields.
 */
export function buildTokenAndMatch(fields: string[], tokens: string[]): Record<string, unknown> {
  const clauses = tokens.map((token) => ({
    $or: fields.map((field) => ({ [field]: { $regex: `\\b${escapeRegex(token)}`, $options: 'i' } })),
  }));
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

/** Plain-JS equivalent of buildTokenAndMatch for segments that filter an already-fetched list. */
export function allTokensMatchText(tokens: string[], texts: Array<unknown>): boolean {
  if (tokens.length === 0) return false;
  const normalizedTexts = texts.map((t) => String(t || '').toLowerCase());
  return tokens.every((token) => normalizedTexts.some((text) => text.includes(token)));
}

/**
 * Small relevance score for ranking candidates: exact full-string match on a field beats
 * every token starting a word, which beats a token merely appearing mid-string.
 */
export function scoreMatch(tokens: string[], texts: Array<unknown>): number {
  const normalizedTexts = texts.map((t) => String(t || '').toLowerCase());
  const query = tokens.join(' ');
  let score = 0;
  for (const text of normalizedTexts) {
    if (!text) continue;
    if (text === query) {
      score += 100;
      continue;
    }
    for (const token of tokens) {
      if (!token) continue;
      if (new RegExp(`\\b${escapeRegex(token)}`).test(text)) {
        score += 3;
      } else if (text.includes(token)) {
        score += 1;
      }
    }
  }
  return score;
}
