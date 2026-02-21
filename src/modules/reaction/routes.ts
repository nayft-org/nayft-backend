import { Router } from 'express';
import { reactionController } from './controller';
import { authenticate, optionalAuth } from '../../middlewares/auth';

const router = Router({ mergeParams: true });

router.put('/:newsId/reactions', authenticate, reactionController.toggle);
router.delete('/:newsId/reactions', authenticate, reactionController.remove);
router.get('/:newsId/reactions', optionalAuth, reactionController.get);
router.get('/:newsId/reactions/users', reactionController.getUsers);

export default router;
