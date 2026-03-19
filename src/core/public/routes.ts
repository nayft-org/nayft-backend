import { Router } from 'express';
import { body } from 'express-validator';
import { featurePublicController } from '../feature-system/public.controller';
import { eventPublicController } from '../event-system/public.controller';
import { optionalAuth } from '../../middlewares/auth';

const router = Router();

// Public feature list (active features only) - for hasFeature() on frontend
router.get('/features', featurePublicController.getActive);

// Event tracking - optional auth (userId attached if logged in)
router.post(
  '/events',
  optionalAuth,
  [
    body('featureKey').notEmpty().withMessage('featureKey is required'),
    body('eventType').notEmpty().withMessage('eventType is required'),
    body('metadata').optional().isObject(),
  ],
  eventPublicController.track
);

export default router;
