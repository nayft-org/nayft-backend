/** Bump when masking / provider contract semantics change (invalidates Redis translation keys). */
export const TRANSLATION_PIPELINE_VER = 2;

/** Guardrails — exceed → English passthrough for overflow strings + metric. */
export const TRANSLATION_MAX_STRINGS_PER_REQUEST = 200;
export const TRANSLATION_MAX_CHARS_TOTAL = 120_000;

/** Redis TTL for translated snippets (seconds). */
export const TRANSLATION_TTL_NEWS_LIKE_SECONDS = 60 * 60 * 24 * 14;
export const TRANSLATION_TTL_UGC_SECONDS = 60 * 60 * 24 * 3;
