import { Router } from 'express';
import { featureController } from '../feature-system/feature.controller';
import { eventController } from '../event-system/event.controller';
import { planController } from '../plan.controller';
import { adminAuth } from '../../middlewares/adminAuth';
import { notificationsAdminController } from '../../modules/notifications/admin.controller';

const router = Router();

router.use(adminAuth);

// Features API
router.get('/features', featureController.getAll);
router.patch('/features/:key', featureController.patch);

// Plans API
router.get('/plans', planController.getAll);

// Events API - group by featureKey, filter by date range
router.get('/events/trends', eventController.getTrends);
router.get('/events/feature/:featureKey', eventController.getByFeature);

// Notifications ops / observability
router.get('/notifications/health', notificationsAdminController.health);

export default router;
