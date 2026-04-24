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
  next();
}
