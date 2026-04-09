import { Router } from 'express';
import { userController } from './controller';
import { authenticate } from '../../middlewares/auth';

const router = Router();

router.get('/preferences', authenticate, userController.getPreferences);
router.patch('/preferences', authenticate, userController.updatePreferences);
router.get('/search', authenticate, userController.searchUsers);
router.post('/follow/:coinId', authenticate, userController.toggleFollowCoin);

export default router;

