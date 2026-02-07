import { Router } from 'express';
import { newsController } from './controller';
import { authenticate } from '../../middlewares/auth';

const router = Router();

router.get('/', newsController.getAllNews);
router.get('/following', authenticate, newsController.getFollowingNews);
router.get('/:newsId', newsController.getNewsDetail);

export default router;

