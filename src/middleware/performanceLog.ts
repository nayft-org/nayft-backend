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
  const origJson = res.json.bind(res);
  let responseBytes = 0;

  res.json = function logJson(body: unknown) {
    try {
      responseBytes = Buffer.byteLength(JSON.stringify(body), 'utf8');
    } catch {
      responseBytes = 0;
    }
    return origJson(body);
  };

  res.on('finish', () => {
    if (!shouldSample()) return;
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
