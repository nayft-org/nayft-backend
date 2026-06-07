import { Router } from 'express';
import { userController } from './controller';
import { userExportController } from './export.controller';
import { authenticate } from '../../middlewares/auth';

const router = Router();

router.get('/me/export', authenticate, userExportController.exportMe);

router.get('/preferences', authenticate, userController.getPreferences);
router.patch('/preferences', authenticate, userController.updatePreferences);
router.get('/search', authenticate, userController.searchUsers);
router.post('/follow/:coinId', authenticate, userController.toggleFollowCoin);
router.delete('/me', authenticate, userController.deleteMe);

export default router;

