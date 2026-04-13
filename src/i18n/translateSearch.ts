import type { SupportedLanguage } from '../modules/user/supportedLanguages';
import type { UnifiedSearchResponse } from '../modules/search/service';
import { translateBatch } from './translationService';
import { TRANSLATION_TTL_NEWS_LIKE_SECONDS } from './translationConstants';

/**
 * English unified search payload → translate news + newsBoards only (not coin names, usernames, symbols).
 * Returns a **new** response object (immutable).
 */
export async function translateUnifiedSearchResponse(
  response: UnifiedSearchResponse,
  lang: SupportedLanguage
): Promise<UnifiedSearchResponse> {
  if (lang === 'en') {
    return {
      ...response,
      results: {
        ...response.results,
        news: response.results.news.map((n) => ({ ...n })),
        newsBoards: response.results.newsBoards.map((b) => ({ ...b })),
      },
      meta: { ...response.meta },
    };
  }

  const news = response.results.news.map((n) => ({ ...n }));
  const boards = response.results.newsBoards.map((b) => ({ ...b }));

  const strings: string[] = [];
  const slots: { seg: 'news' | 'board'; i: number; field: 'title' | 'summary' | 'subtitle' | 'name' }[] =
    [];

  news.forEach((n, i) => {
    if (n.title) {
      strings.push(n.title);
      slots.push({ seg: 'news', i, field: 'title' });
    }
    if (n.summary) {
      strings.push(n.summary);
      slots.push({ seg: 'news', i, field: 'summary' });
    }
    if (n.subtitle) {
      strings.push(n.subtitle);
      slots.push({ seg: 'news', i, field: 'subtitle' });
    }
  });

  boards.forEach((b, i) => {
    if (b.name) {
      strings.push(b.name);
      slots.push({ seg: 'board', i, field: 'name' });
    }
  });

  if (strings.length === 0) {
    return {
      ...response,
      results: {
        ...response.results,
        news,
        newsBoards: boards,
      },
      meta: { ...response.meta },
    };
  }

  const out = await translateBatch(strings, lang, TRANSLATION_TTL_NEWS_LIKE_SECONDS);

  slots.forEach((s, idx) => {
    const text = out[idx];
    if (s.seg === 'news') {
      const row = news[s.i];
      if (s.field === 'title') row.title = text;
      if (s.field === 'summary') row.summary = text;
      if (s.field === 'subtitle') row.subtitle = text;
    } else {
      boards[s.i].name = text;
    }
  });

  // #region agent log
  {
    const nt = news[0]?.title;
    const _dbg = { sessionId: '10418d', location: 'translateSearch.ts:done', message: 'unified search strings translated', data: { lang, slotCount: slots.length, newsRows: news.length, boardsRows: boards.length, firstNewsTitleSample: typeof nt === 'string' ? nt.slice(0, 72) : null }, timestamp: Date.now(), hypothesisId: 'flow-i18n' };
    console.log('[i18n-debug]', _dbg);
    fetch('http://127.0.0.1:7723/ingest/46df119a-fef3-4d2e-b178-17829c05f667', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '10418d' }, body: JSON.stringify(_dbg) }).catch(() => {});
  }
  // #endregion

  return {
    ...response,
    results: {
      ...response.results,
      news,
      newsBoards: boards,
    },
    meta: { ...response.meta },
  };
}
