import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { recordHttpRequest } from '../utils/httpPerformanceStats';

function shouldSample(): boolean {
  if (config.nodeEnv !== 'production') return true;
  return Math.random() < config.perfLogSampleRate;
}

/**
 * Logs request duration and approximate JSON response size (when res.json is used).
 */
export function performanceLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/health' || req.path === '/favicon.ico') {
    next();
    return;
  }

  const start = Date.now();

  res.on('finish', () => {
    if (!shouldSample()) return;
    const rawContentLength = res.getHeader('content-length');
    const responseBytes =
      typeof rawContentLength === 'number'
        ? rawContentLength
        : typeof rawContentLength === 'string'
          ? Number.parseInt(rawContentLength, 10) || 0
          : 0;
    const path = (req as Request & { route?: { path?: string } }).route?.path
      ? `${req.baseUrl}${(req as Request & { route: { path: string } }).route.path}`
      : req.originalUrl.split('?')[0];
    recordHttpRequest({
      method: req.method,
      path: path || req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
      responseBytes,
    });
  });

  next();
}
