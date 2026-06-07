import { Router } from 'express';
import { userController } from './controller';
import { userExportController } from './export.controller';
import { authenticate } from '../../middlewares/auth';
import { requireEmailVerified } from '../auth/middleware/requireEmailVerified';

const router = Router();

router.get('/me/export', authenticate, requireEmailVerified, userExportController.exportMe);

router.get('/preferences', authenticate, userController.getPreferences);
router.patch('/preferences', authenticate, userController.updatePreferences);
router.get('/search', authenticate, requireEmailVerified, userController.searchUsers);
router.post('/follow/:coinId', authenticate, requireEmailVerified, userController.toggleFollowCoin);
router.delete('/me', authenticate, userController.deleteMe);

export default router;

