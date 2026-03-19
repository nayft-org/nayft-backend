import { Request, Response, NextFunction } from 'express';

/**
 * Simple admin auth: require x-admin-key header to match ADMIN_API_KEY env.
 * If ADMIN_API_KEY is not set, admin routes are disabled (501).
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const key = process.env.ADMIN_API_KEY;
  if (!key) {
    res.status(501).json({ success: false, error: 'Admin API not configured' });
    return;
  }
  const header = req.headers['x-admin-key'];
  if (header !== key) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  next();
}
