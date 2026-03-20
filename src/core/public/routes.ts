import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { featurePublicController } from '../feature-system/public.controller';
import { eventPublicController } from '../event-system/public.controller';
import { optionalAuth } from '../../middlewares/auth';

const router = Router();

const eventRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { success: false, error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public feature list (active features only) - for hasFeature() on frontend
router.get('/features', featurePublicController.getActive);

// Event tracking - optional auth (userId attached if logged in)
router.post(
  '/events',
  eventRateLimiter,
  optionalAuth,
  eventPublicController.track
);

export default router;
