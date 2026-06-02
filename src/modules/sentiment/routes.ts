import { Router } from 'express';
import { sentimentController } from './controllers/sentiment.controller';

const router = Router();

router.get('/trending', sentimentController.getTrending);
router.get('/:symbol', sentimentController.getCoinSentiment);

export default router;
