import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';
import { emitSampledSystemError } from '../core/event-system/systemErrorTelemetry';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('Error:', err);
  void emitSampledSystemError(req);
  sendError(res, err.message || 'Internal server error', 500);
};

