import { Router, Request, Response, NextFunction } from 'express';
import { featureController } from '../feature-system/feature.controller';
import { eventController } from '../event-system/event.controller';
import { planController } from '../plan.controller';
import { adminAuth } from '../../middlewares/adminAuth';

const router = Router();

// Log admin API requests (helps verify CORS and network connectivity)
router.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[Admin] ${req.method} ${req.path}`);
  next();
});

router.use(adminAuth);

// Features API
router.get('/features', featureController.getAll);
router.patch('/features/:key', featureController.patchIsActive);
router.delete('/features/:key', featureController.delete);

// Plans API
router.get('/plans', planController.getAll);

// Events API - group by featureKey, filter by date range
router.get('/events/trends', eventController.getTrends);
router.get('/events/feature/:featureKey', eventController.getByFeature);

export default router;
