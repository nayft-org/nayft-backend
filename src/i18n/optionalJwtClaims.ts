import { Request, Response, NextFunction } from 'express';
import { extractBearerToken, verifyAccessToken } from '../middlewares/jwtPayload';

/**
 * Decodes Authorization Bearer JWT without failing (never 401).
 * Attaches jwtUserId + jwtPreferredLanguage for resolveLanguage and optionalAuth.
 * Runs after express.json on all routes.
 */
export function optionalJwtClaimsMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req.headers.authorization);
  const payload = verifyAccessToken(token);
  if (payload) {
    req.jwtUserId = payload.userId;
    req.jwtPreferredLanguage =
      payload.preferredLanguage === undefined ? undefined : payload.preferredLanguage;
  } else {
    req.jwtUserId = undefined;
    req.jwtPreferredLanguage = undefined;
  }
  // #region agent log
  {
    const _dbg = { sessionId: '10418d', location: 'optionalJwtClaims.ts', message: 'JWT decode (no secrets)', data: { path: req.path, bearerPresent: Boolean(token), payloadValid: Boolean(payload), jwtPreferredLanguage: payload?.preferredLanguage ?? null }, timestamp: Date.now(), hypothesisId: 'flow-i18n' };
    console.log('[i18n-debug]', _dbg);
    fetch('http://127.0.0.1:7723/ingest/46df119a-fef3-4d2e-b178-17829c05f667', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '10418d' }, body: JSON.stringify(_dbg) }).catch(() => {});
  }
  // #endregion
  next();
}
