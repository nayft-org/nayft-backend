import { Router } from 'express';
import { commentController } from './controller';
import { authenticate } from '../../middlewares/auth';

const router = Router({ mergeParams: true });

router.get('/:newsId/comments', commentController.getComments);
router.get('/:newsId/comments/:commentId/replies', commentController.getReplies);
router.post('/:newsId/comments', authenticate, commentController.addComment);
router.delete('/:newsId/comments/:commentId', authenticate, commentController.deleteComment);

export default router;
