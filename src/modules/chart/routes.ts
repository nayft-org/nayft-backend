import { Router } from 'express';
import { chartController } from './controller';

const router = Router();

router.get('/klines', chartController.getKlines);
router.get('/market-trend', chartController.getMarketTrend);
router.get('/market-trend-v2', chartController.getMarketTrendV2);
router.get('/market-trend-ohlc', chartController.getMarketTrendOHLC);
router.get('/trades', chartController.getTrades);
router.get('/aggTrades', chartController.getAggTrades);

export default router;
