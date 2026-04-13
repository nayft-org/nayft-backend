/**
 * Bump when masking / provider contract semantics change. This value only appears in the Redis key
 * prefix (`i18n:p{N}:d…:h:…:lang` in `translationKeys.ts`) — it does not change which languages resolve
 * or how translation runs.
 *
 * **Why a higher N can “break” everything while an old N still works:** older `N` reuses keys that
 * already hold good strings in Redis (warm cache → hits). A new `N` is a cold namespace: every string
 * is a miss and must be filled by the live provider (MyMemory quota / errors → English). English
 * always “works” because `lang === 'en'` skips machine translation.
 */
export const TRANSLATION_PIPELINE_VER = 2;

/** Guardrails — exceed → English passthrough for overflow strings + metric. */
export const TRANSLATION_MAX_STRINGS_PER_REQUEST = 200;
export const TRANSLATION_MAX_CHARS_TOTAL = 120_000;

/** Redis TTL for translated snippets (seconds). */
export const TRANSLATION_TTL_NEWS_LIKE_SECONDS = 60 * 60 * 24 * 14;
export const TRANSLATION_TTL_UGC_SECONDS = 60 * 60 * 24 * 3;
