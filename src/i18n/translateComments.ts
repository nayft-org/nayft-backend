import type { SupportedLanguage } from '../modules/user/supportedLanguages';
import { translateBatch } from './translationService';
import { TRANSLATION_TTL_UGC_SECONDS } from './translationConstants';

export type CommentDto = {
  id?: unknown;
  body?: string;
  [key: string]: unknown;
};

export async function translateCommentDtos<T extends CommentDto>(
  comments: T[],
  lang: SupportedLanguage
): Promise<T[]> {
  if (lang === 'en' || comments.length === 0) {
    return comments.map((c) => ({ ...c }));
  }

  const clones = comments.map((c) => ({ ...c }));
  const strings: string[] = [];
  const indices: number[] = [];

  clones.forEach((c, i) => {
    const body = c.body;
    if (typeof body === 'string' && body.length > 0 && body !== '[deleted]') {
      strings.push(body);
      indices.push(i);
    }
  });

  if (strings.length === 0) {
    return clones as T[];
  }

  const out = await translateBatch(strings, lang, TRANSLATION_TTL_UGC_SECONDS);
  indices.forEach((idx, si) => {
    (clones[idx] as Record<string, unknown>).body = out[si];
  });

  return clones as T[];
}
