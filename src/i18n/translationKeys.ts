import { createHash } from 'crypto';
import { TRANSLATION_PIPELINE_VER } from './translationConstants';

export function hashNormalizedSource(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export function normalizeForTranslation(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/**
 * Redis key for a single translated string. Separate namespace from entity caches (news:list, search:, …).
 */
export function buildTranslationRedisKey(params: {
  dictVer: number;
  contentHash: string;
  lang: string;
}): string {
  return `i18n:p${TRANSLATION_PIPELINE_VER}:d${params.dictVer}:h:${params.contentHash}:${params.lang}`;
}
