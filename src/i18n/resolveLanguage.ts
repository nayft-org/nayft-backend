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

    // #region agent log
    {
      const _dbg = { sessionId: '10418d', location: 'resolveLanguage.ts:entry', message: 'resolveLanguage feature gate', data: { path: req.path, multiLang, acceptLanguage: req.headers['accept-language']?.slice(0, 80) ?? null }, timestamp: Date.now(), hypothesisId: 'H-A' };
      console.log('[i18n-debug]', _dbg);
      fetch('http://127.0.0.1:7723/ingest/46df119a-fef3-4d2e-b178-17829c05f667', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '10418d' }, body: JSON.stringify(_dbg) }).catch(() => {});
    }
    // #endregion

    if (!multiLang) {
      req.resolvedLanguage = 'en';
      req.languageSource = 'default';
      // #region agent log
      {
        const _dbg = { sessionId: '10418d', location: 'resolveLanguage.ts:multiLangOff', message: 'forced en — multi_language inactive', data: { path: req.path }, timestamp: Date.now(), hypothesisId: 'H-A' };
        console.log('[i18n-debug]', _dbg);
        fetch('http://127.0.0.1:7723/ingest/46df119a-fef3-4d2e-b178-17829c05f667', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '10418d' }, body: JSON.stringify(_dbg) }).catch(() => {});
      }
      // #endregion
      next();
      return;
    }

    const fromHeader = languageFromAcceptHeader(req.headers['accept-language']);
    if (fromHeader) {
      req.resolvedLanguage = fromHeader;
      req.languageSource = 'header';
      // #region agent log
      {
        const _dbg = { sessionId: '10418d', location: 'resolveLanguage.ts:fromHeader', message: 'resolved from Accept-Language', data: { path: req.path, resolved: fromHeader }, timestamp: Date.now(), hypothesisId: 'H-B' };
        console.log('[i18n-debug]', _dbg);
        fetch('http://127.0.0.1:7723/ingest/46df119a-fef3-4d2e-b178-17829c05f667', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '10418d' }, body: JSON.stringify(_dbg) }).catch(() => {});
      }
      // #endregion
      next();
      return;
    }

    const fromQuery = languageFromQuery(req.query.lang);
    if (fromQuery) {
      req.resolvedLanguage = fromQuery;
      req.languageSource = 'query';
      // #region agent log
      {
        const _dbg = { sessionId: '10418d', location: 'resolveLanguage.ts:fromQuery', message: 'resolved from query lang', data: { path: req.path, resolved: fromQuery }, timestamp: Date.now(), hypothesisId: 'H-B' };
        console.log('[i18n-debug]', _dbg);
        fetch('http://127.0.0.1:7723/ingest/46df119a-fef3-4d2e-b178-17829c05f667', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '10418d' }, body: JSON.stringify(_dbg) }).catch(() => {});
      }
      // #endregion
      next();
      return;
    }

    const jwtPref = req.jwtPreferredLanguage;
    if (jwtPref != null && jwtPref !== '' && isSupportedLanguage(jwtPref)) {
      req.resolvedLanguage = jwtPref as SupportedLanguage;
      req.languageSource = 'jwt';
      // #region agent log
      {
        const _dbg = { sessionId: '10418d', location: 'resolveLanguage.ts:fromJwt', message: 'resolved from JWT pref', data: { path: req.path, resolved: jwtPref }, timestamp: Date.now(), hypothesisId: 'H-B' };
        console.log('[i18n-debug]', _dbg);
        fetch('http://127.0.0.1:7723/ingest/46df119a-fef3-4d2e-b178-17829c05f667', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '10418d' }, body: JSON.stringify(_dbg) }).catch(() => {});
      }
      // #endregion
      next();
      return;
    }

    req.resolvedLanguage = 'en';
    req.languageSource = 'default';
    // #region agent log
    {
      const _dbg = { sessionId: '10418d', location: 'resolveLanguage.ts:finalDefault', message: 'resolved en (no header/query/jwt)', data: { path: req.path }, timestamp: Date.now(), hypothesisId: 'H-B' };
      console.log('[i18n-debug]', _dbg);
      fetch('http://127.0.0.1:7723/ingest/46df119a-fef3-4d2e-b178-17829c05f667', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '10418d' }, body: JSON.stringify(_dbg) }).catch(() => {});
    }
    // #endregion
    next();
  })().catch(() => {
    req.resolvedLanguage = 'en';
    req.languageSource = 'default';
    // #region agent log
    {
      const _dbg = { sessionId: '10418d', location: 'resolveLanguage.ts:catch', message: 'resolveLanguage async error — forced en', data: { path: req.path }, timestamp: Date.now(), hypothesisId: 'H-D' };
      console.log('[i18n-debug]', _dbg);
      fetch('http://127.0.0.1:7723/ingest/46df119a-fef3-4d2e-b178-17829c05f667', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '10418d' }, body: JSON.stringify(_dbg) }).catch(() => {});
    }
    // #endregion
    next();
  });
}

/** For tests and docs — supported language codes. */
export const RESOLVER_SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES;
