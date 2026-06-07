import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';
import { eventService } from '../core/event-system';
import { hashRoute } from '../core/event-system/eventValidation.service';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('Error:', err);
  eventService.emitEvent({
    featureKey: 'system',
    eventType: 'api_error',
    userId: (req as { userId?: string }).userId,
    metadata: {
      routeHash: hashRoute(req.path),
      errorCode: 'internal_error',
      method: req.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS',
    },
  }).catch(() => {});
  sendError(res, err.message || 'Internal server error', 500);
};

