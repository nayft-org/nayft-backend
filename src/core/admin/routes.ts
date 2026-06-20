import { Router } from 'express';
import { featureController } from '../feature-system/feature.controller';
import { eventController } from '../event-system/event.controller';
import { planController } from '../plan.controller';
import { adminAuth } from '../../middlewares/adminAuth';
import { notificationsAdminController } from '../../modules/notifications/admin.controller';
import { runtimeConfigController } from '../runtime-config/runtimeConfig.controller';
import { emailAdminController } from '../../modules/email/email.admin.controller';
import { sourceAdminController } from '../../modules/news/source.admin.controller';

const router = Router();

router.use(adminAuth);

// Runtime kill switches
router.get('/runtime-config', runtimeConfigController.get);
router.patch('/runtime-config', runtimeConfigController.patch);

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
router.get('/email/health', emailAdminController.health);
router.get('/email/dlq', emailAdminController.peekDlq);
router.get('/email/jobs/:jobId', emailAdminController.inspectJob);
router.post('/email/replay/:jobId', emailAdminController.replayDlqJob);

// Source branding admin
router.get('/sources/health', sourceAdminController.health);
router.get('/sources', sourceAdminController.list);
router.post('/sources/:sourceKey/approve', sourceAdminController.approve);
router.post('/sources/:sourceKey/block', sourceAdminController.block);
router.get('/sources/repair/status', sourceAdminController.repairStatus);
router.post('/sources/repair/replay', sourceAdminController.replayRepair);
router.post('/sources/consistency/run', sourceAdminController.runConsistency);
router.post('/sources/article-counts/refresh', sourceAdminController.refreshArticleCounts);

export default router;
