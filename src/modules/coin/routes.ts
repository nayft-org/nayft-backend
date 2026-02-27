import { Router } from 'express';
import { coinController } from './controller';

const router = Router();

router.post('/create-collections', coinController.createCollections);
router.get('/:coinId', coinController.getCoinProfile);
router.get('/:coinId/news', coinController.getCoinNews);

export default router;

