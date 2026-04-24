import { Request, Response, NextFunction } from 'express';
import { featureService } from '../core/feature-system/feature.service';
import {
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '../modules/user/supportedLanguages';

/**
 * Parses Accept-Language (RFC 7231) and returns first supported base language tag.
 */
function languageFromAcceptHeader(header: string | undefined): SupportedLanguage | null {
  if (!header || typeof header !== 'string') return null;
  const parts = header.split(',');
  for (const part of parts) {
    const tag = part.split(';')[0]?.trim().toLowerCase();
    if (!tag) continue;
    const base = tag.split('-')[0];
    if (base && isSupportedLanguage(base)) {
      return base as SupportedLanguage;
    }
  }
  return null;
}

function languageFromQuery(raw: unknown): SupportedLanguage | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  const base = s.split('-')[0];
  return isSupportedLanguage(base) ? (base as SupportedLanguage) : null;
}

/**
 * Priority: Accept-Language → ?lang= → JWT preferredLanguage → default `en`.
 * When `multi_language` feature is off, forces `en` and source `default`.
 */
export function resolveLanguageMiddleware(req: Request, _res: Response, next: NextFunction): void {
  void (async () => {
    let multiLang = false;
    try {
      multiLang = await featureService.isActive('multi_language');
    } catch {
      multiLang = false;
    }

    if (!multiLang) {
      req.resolvedLanguage = 'en';
      req.languageSource = 'default';
      next();
      return;
    }

    const fromHeader = languageFromAcceptHeader(req.headers['accept-language']);
    if (fromHeader) {
      req.resolvedLanguage = fromHeader;
      req.languageSource = 'header';
      next();
      return;
    }

    const fromQuery = languageFromQuery(req.query.lang);
    if (fromQuery) {
      req.resolvedLanguage = fromQuery;
      req.languageSource = 'query';
      next();
      return;
    }

    const jwtPref = req.jwtPreferredLanguage;
    if (jwtPref != null && jwtPref !== '' && isSupportedLanguage(jwtPref)) {
      req.resolvedLanguage = jwtPref as SupportedLanguage;
      req.languageSource = 'jwt';
      next();
      return;
    }

    req.resolvedLanguage = 'en';
    req.languageSource = 'default';
    next();
  })().catch(() => {
    req.resolvedLanguage = 'en';
    req.languageSource = 'default';
    next();
  });
}

/** For tests and docs — supported language codes. */
export const RESOLVER_SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES;
