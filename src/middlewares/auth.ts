import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { sendError } from '../utils/response';
import { extractBearerToken, verifyAccessToken } from './jwtPayload';

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    sendError(res, 'Authentication token required', 401);
    return;
  }
  const decoded = verifyAccessToken(token);
  if (!decoded) {
    sendError(res, 'Invalid or expired token', 401);
    return;
  }
  req.userId = decoded.userId;
  next();
};

/**
 * Sets userId from JWT when valid. Prefer global optionalJwtClaims decode to avoid duplicate verify.
 */
export const optionalAuth = (req: AuthRequest, _res: Response, next: NextFunction): void => {
  if (req.jwtUserId) {
    req.userId = req.jwtUserId;
  } else {
    const token = extractBearerToken(req.headers.authorization);
    const decoded = verifyAccessToken(token);
    if (decoded) {
      req.userId = decoded.userId;
    }
  }
  next();
};

