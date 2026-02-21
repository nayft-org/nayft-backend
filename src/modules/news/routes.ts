import { Router } from 'express';
import { newsController } from './controller';
import { authenticate, optionalAuth } from '../../middlewares/auth';

const router = Router();

router.post('/store-news', newsController.storeNews);
router.get('/', optionalAuth, newsController.getAllNews);
router.get('/following', authenticate, newsController.getFollowingNews);
router.get('/:newsId', optionalAuth, newsController.getNewsDetail);

export default router;

