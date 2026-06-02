import { Router } from 'express';
import { riskController } from './controllers/risk.controller';

const router = Router();

router.get('/snapshot', riskController.getSnapshot);
router.get('/regime', riskController.getRegime);
router.get('/top-risk', riskController.getTopRisk);
router.get('/movers', riskController.getMovers);
router.get('/coins/:symbol', riskController.getCoin);
router.get('/history/:symbol', riskController.getHistory);

export default router;
