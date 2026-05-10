import { Router } from 'express';
import { marketController } from './controller';

const router = Router();

router.get('/snapshot', marketController.getSnapshot);
router.get('/analysis', marketController.getMarketAnalysis);
router.get('/trending', marketController.getTrending);
router.get('/top-gainers', marketController.getTopGainers);
router.get('/top-losers', marketController.getTopLosers);
router.get('/active-coins', marketController.getActiveCoins);

export default router;

