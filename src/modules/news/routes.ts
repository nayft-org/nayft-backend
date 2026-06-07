import { Router } from 'express';
import { newsController } from './controller';
import { authenticate, optionalAuth } from '../../middlewares/auth';
import { newsIngestAuth } from '../../middlewares/newsIngestAuth';
import sentimentNewsRoutes from '../sentiment/routes';

const router = Router();

router.post('/store-news', newsIngestAuth, newsController.storeNews);
router.use('/sentiment', sentimentNewsRoutes);
router.get('/', optionalAuth, newsController.getAllNews);
router.get('/following', authenticate, newsController.getFollowingNews);
router.get('/:newsId', optionalAuth, newsController.getNewsDetail);

export default router;
