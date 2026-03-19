import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';
import { eventService } from '../core/event-system';

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
    userId: (req as any).userId,
    metadata: {
      path: req.path,
      method: req.method,
      message: err.message?.slice(0, 200),
    },
  }).catch(() => {});
  sendError(res, err.message || 'Internal server error', 500);
};

