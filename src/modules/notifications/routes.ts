import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { notificationsController } from './controller';

const router = Router();

router.use(authenticate);

router.get('/', notificationsController.list);
router.patch('/read-all', notificationsController.markAllRead);
router.get('/unread-count', notificationsController.unreadCount);
router.patch('/:id/read', notificationsController.markRead);
router.delete('/:id', notificationsController.remove);

export default router;

/** Preferences mounted separately at `/api/notification-preferences` for RFC path parity. */
export const notificationPreferencesRouter = Router();
notificationPreferencesRouter.use(authenticate);
notificationPreferencesRouter.get('/', notificationsController.getPreferences);
notificationPreferencesRouter.patch('/', notificationsController.patchPreferences);
