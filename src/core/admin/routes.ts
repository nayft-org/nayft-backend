import { Router } from 'express';
import { featureController } from '../feature-system/feature.controller';
import { eventController } from '../event-system/event.controller';
import { adminAuth } from '../../middlewares/adminAuth';

const router = Router();

router.use(adminAuth);

// Features API
router.get('/features', featureController.getAll);

// Events API - group by featureKey, filter by date range
router.get('/events/trends', eventController.getTrends);
router.get('/events/feature/:featureKey', eventController.getByFeature);

export default router;
