import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config/env';

/** Access token payload issued by authService (login, signup, preference refresh). */
export interface AccessTokenPayload {
  userId: string;
  preferredLanguage?: string | null;
  emailVerified?: boolean;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const emailVerified = payload.emailVerified ?? true;
  const expiresIn = emailVerified ? config.jwtExpiresIn : config.jwtUnverifiedExpiresIn;
  return jwt.sign(
    {
      userId: payload.userId,
      preferredLanguage: payload.preferredLanguage ?? null,
      emailVerified,
    },
    config.jwtSecret,
    { expiresIn } as SignOptions
  );
}

/**
 * Verifies JWT and returns payload, or null if missing/invalid/expired.
 * Never throws — used by global optional JWT middleware and route auth.
 */
export function verifyAccessToken(token: string | undefined | null): AccessTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AccessTokenPayload;
    if (!decoded?.userId || typeof decoded.userId !== 'string') return null;
    return decoded;
  } catch {
    return null;
  }
}

export function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization || typeof authorization !== 'string') return null;
  const parts = authorization.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1] || null;
}
