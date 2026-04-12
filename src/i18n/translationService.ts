import { redis } from '../config/redis';
import { cacheHelpers } from '../config/redis';
import { config } from '../config/env';
import type { SupportedLanguage } from '../modules/user/supportedLanguages';
import { featureService } from '../core/feature-system/feature.service';
import {
  getDictVersion,
  maskCoinTerms,
  refreshCoinDictionary,
  unmaskCoinTerms,
} from './coinDictionary';
import {
  buildTranslationRedisKey,
  hashNormalizedSource,
  normalizeForTranslation,
} from './translationKeys';
import { recordTranslationEvent, recordProviderLatency } from './translationMetrics';
import {
  TRANSLATION_MAX_CHARS_TOTAL,
  TRANSLATION_MAX_STRINGS_PER_REQUEST,
} from './translationConstants';

let dictionaryBootstrapped = false;

async function ensureDictionaryLoaded(): Promise<void> {
  if (dictionaryBootstrapped && getDictVersion() > 0) return;
  await refreshCoinDictionary();
  dictionaryBootstrapped = true;
}

function placeholderFactory(): (i: number) => string {
  return (i: number) => `[[C${i}]]`;
}

/** Google allows many q[] per request; keep chunks small for URL/body limits on large feeds. */
const GOOGLE_TRANSLATE_CHUNK = 128;

type GoogleTranslateV2Response = {
  data?: {
    translations?: Array<{ translatedText: string }>;
  };
};

async function googleTranslateV2Batch(
  texts: string[],
  target: SupportedLanguage,
  apiKey: string
): Promise<string[]> {
  if (texts.length === 0) return [];
  const result: string[] = [];
  for (let offset = 0; offset < texts.length; offset += GOOGLE_TRANSLATE_CHUNK) {
    const chunk = texts.slice(offset, offset + GOOGLE_TRANSLATE_CHUNK);
    const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: chunk,
        target,
        format: 'text',
        source: 'en',
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Google Translate HTTP ${res.status}: ${errBody.slice(0, 400)}`);
    }
    const json = (await res.json()) as GoogleTranslateV2Response;
    const parts = json.data?.translations?.map((t) => t.translatedText) ?? [];
    if (parts.length !== chunk.length) {
      throw new Error(
        `Google Translate length mismatch: expected ${chunk.length}, got ${parts.length}`
      );
    }
    result.push(...parts);
  }
  return result;
}

/** MyMemory free tier: short strings only; used when Google key is absent (dev fallback). */
const MYMEMORY_MAX_LEN = 450;
const MYMEMORY_CONCURRENCY = 6;

async function myMemoryTranslateOne(text: string, target: SupportedLanguage): Promise<string> {
  if (!text || target === 'en') return text;
  const q = text.length > MYMEMORY_MAX_LEN ? text.slice(0, MYMEMORY_MAX_LEN) : text;
  const pair = encodeURIComponent(`en|${target}`);
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${pair}`;
  try {
    const res = await fetch(url);
    const j = (await res.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number;
    };
    const out = j.responseData?.translatedText;
    if (typeof out === 'string' && out.length > 0) return out;
  } catch {
    // fall through
  }
  return text;
}

async function myMemoryTranslateBatch(texts: string[], target: SupportedLanguage): Promise<string[]> {
  const out: string[] = new Array(texts.length);
  for (let i = 0; i < texts.length; i += MYMEMORY_CONCURRENCY) {
    const slice = texts.slice(i, i + MYMEMORY_CONCURRENCY);
    const batch = await Promise.all(slice.map((t) => myMemoryTranslateOne(t, target)));
    for (let j = 0; j < batch.length; j++) {
      out[i + j] = batch[j];
    }
  }
  return out;
}

async function callTranslationProvider(
  texts: string[],
  targetLang: SupportedLanguage
): Promise<string[]> {
  if (targetLang === 'en') return texts;

  const explicit = config.translationProvider;
  const apiKey = config.googleTranslateApiKey;
  const useGoogle =
    explicit !== 'noop' &&
    Boolean(apiKey) &&
    (explicit === '' || explicit === 'google' || explicit === 'google_v2');

  const useMymemoryExplicit = explicit === 'mymemory';
  const useMymemoryFallback =
    explicit !== 'noop' &&
    !useGoogle &&
    (useMymemoryExplicit || config.translationAllowMymemoryFallback);

  const started = Date.now();
  try {
    if (useGoogle && apiKey) {
      const out = await googleTranslateV2Batch(texts, targetLang, apiKey);
      // #region agent log
      {
        const _dbg = { sessionId: '10418d', location: 'translationService.ts:googleOk', message: 'Google Translate applied', data: { count: out.length, sampleOut: (out[0] ?? '').slice(0, 56), target: targetLang }, timestamp: Date.now(), hypothesisId: 'H-C', runId: 'post-fix' };
        console.log('[i18n-debug]', _dbg);
        fetch('http://127.0.0.1:7723/ingest/46df119a-fef3-4d2e-b178-17829c05f667', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '10418d' }, body: JSON.stringify(_dbg) }).catch(() => {});
      }
      // #endregion
      return out;
    }

    if (useMymemoryFallback) {
      const out = await myMemoryTranslateBatch(texts, targetLang);
      // #region agent log
      {
        const _dbg = { sessionId: '10418d', location: 'translationService.ts:mymemoryOk', message: 'MyMemory fallback applied', data: { count: out.length, sampleOut: (out[0] ?? '').slice(0, 56), target: targetLang }, timestamp: Date.now(), hypothesisId: 'H-C', runId: 'post-fix' };
        console.log('[i18n-debug]', _dbg);
        fetch('http://127.0.0.1:7723/ingest/46df119a-fef3-4d2e-b178-17829c05f667', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '10418d' }, body: JSON.stringify(_dbg) }).catch(() => {});
      }
      // #endregion
      return out;
    }

    recordTranslationEvent('fallback_english', texts.length);
    // #region agent log
    {
      const _dbg = { sessionId: '10418d', location: 'translationService.ts:providerNoop', message: 'no Google/MyMemory — English passthrough', data: { target: targetLang, chunkCount: texts.length, explicitProvider: explicit || 'default' }, timestamp: Date.now(), hypothesisId: 'flow-i18n' };
      console.log('[i18n-debug]', _dbg);
      fetch('http://127.0.0.1:7723/ingest/46df119a-fef3-4d2e-b178-17829c05f667', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '10418d' }, body: JSON.stringify(_dbg) }).catch(() => {});
    }
    // #endregion
    return texts;
  } catch (e) {
    recordTranslationEvent('provider_errors', texts.length);
    // #region agent log
    {
      const _dbg = { sessionId: '10418d', location: 'translationService.ts:providerErr', message: (e instanceof Error ? e.message : String(e)).slice(0, 220), data: { target: targetLang }, timestamp: Date.now(), hypothesisId: 'H-C', runId: 'post-fix' };
      console.log('[i18n-debug]', _dbg);
      fetch('http://127.0.0.1:7723/ingest/46df119a-fef3-4d2e-b178-17829c05f667', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '10418d' }, body: JSON.stringify(_dbg) }).catch(() => {});
    }
    // #endregion
    throw e;
  } finally {
    recordProviderLatency(Date.now() - started);
  }
}

/**
 * Batch translate with Redis cache (MGET), coin masking, dedupe, and limits.
 */
export async function translateBatch(
  inputs: string[],
  lang: SupportedLanguage,
  ttlSeconds: number
): Promise<string[]> {
  if (lang === 'en' || inputs.length === 0) {
    return inputs.map((s) => (typeof s === 'string' ? s : String(s)));
  }

  let multiLang = true;
  try {
    multiLang = await featureService.isActive('multi_language');
  } catch {
    multiLang = false;
  }
  if (!multiLang) {
    recordTranslationEvent('fallback_english', inputs.length);
    // #region agent log
    {
      const _dbg = { sessionId: '10418d', location: 'translationService.ts:featureOff', message: 'translateBatch skipped — multi_language inactive', data: { lang, inputCount: inputs.length }, timestamp: Date.now(), hypothesisId: 'H-E' };
      console.log('[i18n-debug]', _dbg);
      fetch('http://127.0.0.1:7723/ingest/46df119a-fef3-4d2e-b178-17829c05f667', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '10418d' }, body: JSON.stringify(_dbg) }).catch(() => {});
    }
    // #endregion
    return inputs.map((s) => (typeof s === 'string' ? s : String(s)));
  }

  // #region agent log
  {
    const _dbg = { sessionId: '10418d', location: 'translationService.ts:translateBatch', message: 'translateBatch active', data: { lang, multiLang, translationProvider: config.translationProvider || 'default', willUseGoogle: Boolean(config.googleTranslateApiKey), allowMymemoryFallback: config.translationAllowMymemoryFallback, inputCount: inputs.length, samplePreview: inputs[0]?.slice(0, 40) ?? '' }, timestamp: Date.now(), hypothesisId: 'H-C' };
    console.log('[i18n-debug]', _dbg);
    fetch('http://127.0.0.1:7723/ingest/46df119a-fef3-4d2e-b178-17829c05f667', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '10418d' }, body: JSON.stringify(_dbg) }).catch(() => {});
  }
  // #endregion

  recordTranslationEvent('requests', 1);
  await ensureDictionaryLoaded();
  const dictVer = getDictVersion();
  const ph = placeholderFactory();

  const outputs = inputs.map((s) => normalizeForTranslation(typeof s === 'string' ? s : String(s)));

  const work: { idx: number; hash: string; text: string }[] = [];
  let charBudget = 0;
  for (let idx = 0; idx < outputs.length; idx++) {
    if (work.length >= TRANSLATION_MAX_STRINGS_PER_REQUEST) {
      recordTranslationEvent('truncated', outputs.length - idx);
      break;
    }
    const t = outputs[idx];
    if (!t) continue;
    if (charBudget + t.length > TRANSLATION_MAX_CHARS_TOTAL) {
      recordTranslationEvent('truncated', outputs.length - idx);
      break;
    }
    charBudget += t.length;
    work.push({ idx, text: t, hash: hashNormalizedSource(t) });
  }

  if (work.length === 0) {
    return outputs;
  }

  const uniqueHashes = [...new Set(work.map((w) => w.hash))];
  const keys = uniqueHashes.map((h) =>
    buildTranslationRedisKey({ dictVer, contentHash: h, lang })
  );

  let cached: (string | null)[] = [];
  try {
    cached = keys.length > 0 ? await redis.mget(...keys) : [];
  } catch {
    cached = keys.map(() => null);
  }

  const hashToTranslated = new Map<string, string>();
  uniqueHashes.forEach((h, i) => {
    const raw = cached[i];
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { t?: string };
      if (parsed?.t !== undefined && typeof parsed.t === 'string') {
        hashToTranslated.set(h, parsed.t);
        recordTranslationEvent('cache_hits', 1);
      }
    } catch {
      // treat as miss
    }
  });

  const misses = uniqueHashes.filter((h) => !hashToTranslated.has(h));
  for (const _ of misses) {
    recordTranslationEvent('cache_misses', 1);
  }

  if (misses.length > 0) {
    const hashToText = new Map(work.map((w) => [w.hash, w.text]));
    const toTranslate = misses.map((h) => hashToText.get(h) ?? '');

    let translatedPieces: string[] = [];
    try {
      const maskedPieces = toTranslate.map((text) => maskCoinTerms(text, ph));
      const batchIn = maskedPieces.map((m) => m.masked);
      const providerOut = await callTranslationProvider(batchIn, lang);
      translatedPieces = providerOut.map((out, i) =>
        unmaskCoinTerms(out, maskedPieces[i].originals, ph)
      );
    } catch {
      recordTranslationEvent('provider_errors', misses.length);
      translatedPieces = toTranslate;
    }

    for (let i = 0; i < misses.length; i++) {
      const h = misses[i];
      const val = translatedPieces[i] ?? toTranslate[i];
      hashToTranslated.set(h, val);
      const redisKey = buildTranslationRedisKey({ dictVer, contentHash: h, lang });
      try {
        await cacheHelpers.set(redisKey, { t: val, v: 1 }, ttlSeconds);
      } catch {
        // ignore
      }
      recordTranslationEvent('chars_sent', val.length);
    }
  }

  for (const row of work) {
    const tr = hashToTranslated.get(row.hash);
    if (tr !== undefined) {
      outputs[row.idx] = tr;
    }
  }

  // #region agent log
  {
    const hitCount = uniqueHashes.length - misses.length;
    const firstIdx = work[0]?.idx ?? 0;
    const _dbg = { sessionId: '10418d', location: 'translationService.ts:translateBatchDone', message: 'translateBatch finished', data: { lang, dictVer, uniqueKeys: uniqueHashes.length, redisHits: hitCount, redisMisses: misses.length, firstOutputSample: (outputs[firstIdx] ?? '').slice(0, 72) }, timestamp: Date.now(), hypothesisId: 'flow-i18n' };
    console.log('[i18n-debug]', _dbg);
    fetch('http://127.0.0.1:7723/ingest/46df119a-fef3-4d2e-b178-17829c05f667', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '10418d' }, body: JSON.stringify(_dbg) }).catch(() => {});
  }
  // #endregion

  return outputs;
}
