import type { SupportedLanguage } from '../modules/user/supportedLanguages';
import { translateBatch } from './translationService';
import { TRANSLATION_TTL_NEWS_LIKE_SECONDS } from './translationConstants';

type Category = { key: string; name: string };

/** Shape returned by newsService mappers — only string fields are translated. */
export type TranslatableNewsArticle = {
  title?: string;
  summary?: string;
  subtitle?: string;
  source?: string;
  categories?: Category[];
  [key: string]: unknown;
};

/**
 * Deep-enough clone + translate translatable fields; preserves `relatedCoins`, ids, numbers.
 */
export async function translateNewsArticleDtos<T extends TranslatableNewsArticle>(
  articles: T[],
  lang: SupportedLanguage
): Promise<T[]> {
  if (lang === 'en' || articles.length === 0) {
    return articles.map((a) => ({ ...a }));
  }

  const clones = articles.map((a) => ({
    ...a,
    categories: Array.isArray(a.categories) ? a.categories.map((c) => ({ ...c })) : a.categories,
  }));
  const strings: string[] = [];
  const targets: { articleIdx: number; kind: 'field' | 'cat'; field?: string; catIdx?: number }[] =
    [];

  clones.forEach((article, articleIdx) => {
    for (const field of ['title', 'summary', 'subtitle', 'source'] as const) {
      const v = article[field];
      if (typeof v === 'string' && v.length > 0) {
        strings.push(v);
        targets.push({ articleIdx, kind: 'field', field });
      }
    }
    const cats = article.categories;
    if (Array.isArray(cats)) {
      cats.forEach((c, catIdx) => {
        if (c && typeof c.name === 'string' && c.name.length > 0) {
          strings.push(c.name);
          targets.push({ articleIdx, kind: 'cat', catIdx });
        }
      });
    }
  });

  if (strings.length === 0) {
    return clones as T[];
  }

  const translated = await translateBatch(strings, lang, TRANSLATION_TTL_NEWS_LIKE_SECONDS);

  targets.forEach((t, i) => {
    const text = translated[i];
    const art = clones[t.articleIdx];
    if (t.kind === 'field' && t.field) {
      (art as Record<string, unknown>)[t.field] = text;
    }
    if (t.kind === 'cat' && t.catIdx !== undefined && Array.isArray(art.categories)) {
      const c = art.categories[t.catIdx];
      if (c) {
        art.categories[t.catIdx] = { ...c, name: text };
      }
    }
  });

  return clones as T[];
}

export async function translateSingleNewsArticle<T extends TranslatableNewsArticle>(
  article: T,
  lang: SupportedLanguage
): Promise<T> {
  const [out] = await translateNewsArticleDtos([article], lang);
  return out;
}
