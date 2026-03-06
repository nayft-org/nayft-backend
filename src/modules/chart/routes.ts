import { Router } from 'express';
import { chartController } from './controller';

const router = Router();

router.get('/klines', chartController.getKlines);
router.get('/trades', chartController.getTrades);
router.get('/aggTrades', chartController.getAggTrades);

export default router;
