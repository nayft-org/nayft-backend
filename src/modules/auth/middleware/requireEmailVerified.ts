import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../../types';
import { verifyAccessToken, extractBearerToken } from '../../../middlewares/jwtPayload';
import { authRepository } from '../repository';
import { isEmailVerificationEnforced } from '../authVerification.config';
import { sendError } from '../../../utils/response';
import { eventService } from '../../../core/event-system';
import { hashRoute } from '../../../core/event-system/eventRegistry';

export async function requireEmailVerified(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const enforced = await isEmailVerificationEnforced();
    if (!enforced) {
      next();
      return;
    }

    if (!req.userId) {
      sendError(res, 'Unauthorized', 401);
      return;
    }

    let emailVerified = false;
    const token = extractBearerToken(req.headers.authorization);
    const payload = verifyAccessToken(token);
    if (payload?.emailVerified === true) {
      emailVerified = true;
    }

    if (!emailVerified) {
      const user = await authRepository.findById(req.userId);
      emailVerified = Boolean(user?.emailVerified);
    }

    if (!emailVerified) {
      eventService.emitEvent({
        featureKey: 'auth',
        eventType: 'verification_bypass_attempt',
        userId: req.userId,
        metadata: { routeHash: hashRoute(req.path) },
      }).catch(() => {});

      sendError(res, 'EMAIL_NOT_VERIFIED: Email verification required', 403);
      return;
    }

    next();
  } catch {
    sendError(res, 'Email verification check failed', 500);
  }
}
