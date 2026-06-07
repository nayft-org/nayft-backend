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
import { getRuntimeSwitches } from '../core/runtime-config/runtimeConfig.service';
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

/**
 * Free MT often rewrites [[C0]] → [[C1]] or drops markers. `unmaskCoinTerms` requires [[C0]]..[[C(n-1)]]
 * matching `originals`. Re-map each [[C\d+]] in provider output (left-to-right) to ph(0)..ph(n-1).
 */
function realignProviderPlaceholders(
  maskedInput: string,
  providerOut: string,
  placeholder: (i: number) => string
): string {
  const n = (maskedInput.match(/\[\[C\d+\]\]/g) || []).length;
  if (n === 0) return providerOut;
  let k = 0;
  return providerOut.replace(/\[\[C\d+\]\]/g, () => {
    if (k < n) return placeholder(k++);
    return placeholder(n - 1);
  });
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

/** Only treat explicit HTTP-style error codes as failure; success responses vary (200, "200", omitted, ""). */
function myMemoryStatusIsError(status: unknown): boolean {
  if (status === undefined || status === null || status === '') return false;
  const n = typeof status === 'number' ? status : Number(String(status).trim());
  if (Number.isFinite(n) && n >= 400) return true;
  return false;
}

function isMyMemoryGarbageTranslation(out: string): boolean {
  return /MYMEMORY\s+(WARNING|ERROR)/i.test(out);
}

async function myMemoryTranslateOne(text: string, target: SupportedLanguage): Promise<string> {
  if (!text || target === 'en') return text;
  const q = text.length > MYMEMORY_MAX_LEN ? text.slice(0, MYMEMORY_MAX_LEN) : text;
  const pair = encodeURIComponent(`en|${target}`);
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${pair}`;
  try {
    const res = await fetch(url);
    const j = (await res.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number | string;
    };
    if (myMemoryStatusIsError(j.responseStatus)) {
      return text;
    }
    const out = j.responseData?.translatedText;
    if (typeof out === 'string' && out.length > 0 && !isMyMemoryGarbageTranslation(out)) {
      return out;
    }
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
      return out;
    }

    if (useMymemoryFallback) {
      const out = await myMemoryTranslateBatch(texts, targetLang);
      return out;
    }

    recordTranslationEvent('fallback_english', texts.length);
    return texts;
  } catch (e) {
    recordTranslationEvent('provider_errors', texts.length);
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

  const switches = await getRuntimeSwitches();
  if (!switches.third_party_translate_enabled) {
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
    return inputs.map((s) => (typeof s === 'string' ? s : String(s)));
  }

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
      translatedPieces = providerOut.map((out, i) => {
        const aligned = realignProviderPlaceholders(batchIn[i], out, ph);
        return unmaskCoinTerms(aligned, maskedPieces[i].originals, ph);
      });
    } catch {
      recordTranslationEvent('provider_errors', misses.length);
      translatedPieces = toTranslate;
    }

    for (let i = 0; i < misses.length; i++) {
      const h = misses[i];
      const src = toTranslate[i];
      const val = translatedPieces[i] ?? src;
      hashToTranslated.set(h, val);
      const redisKey = buildTranslationRedisKey({ dictVer, contentHash: h, lang });
      // Do not persist unchanged source (quota / failed MT); successful translations differ from English `src`.
      const skipRedisCache = val === src && src.length > 0;
      if (!skipRedisCache) {
        try {
          await cacheHelpers.set(redisKey, { t: val, v: 1 }, ttlSeconds);
        } catch {
          // ignore
        }
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

  return outputs;
}
