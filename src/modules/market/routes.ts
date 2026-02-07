import { Router } from 'express';
import { marketController } from './controller';

const router = Router();

router.get('/trending', marketController.getTrending);
router.get('/top-gainers', marketController.getTopGainers);
router.get('/top-losers', marketController.getTopLosers);

export default router;

