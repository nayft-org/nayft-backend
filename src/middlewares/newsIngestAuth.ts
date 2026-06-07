import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { sendError } from '../utils/response';

/** Protects news ingestion endpoint with shared API key. */
export function newsIngestAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.newsIngestApiKey) {
    sendError(res, 'News ingestion is not configured', 501);
    return;
  }
  const key = req.headers['x-ingest-key'];
  if (typeof key !== 'string' || key !== config.newsIngestApiKey) {
    sendError(res, 'Unauthorized', 401);
    return;
  }
  next();
}
