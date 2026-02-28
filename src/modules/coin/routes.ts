import { Router } from 'express';
import { coinController } from './controller';

const router = Router();

router.post('/create-collections', coinController.createCollections);
router.post('/populate-labeled-coins', coinController.populateLabeledCoins);
router.post('/populate-active-coins', coinController.populateLabeledActiveCoins);
router.post('/populate-cmc-labeled-coins', coinController.populateCmcLabeledCoins);
router.get('/:coinId/stats', coinController.getCoinStats);
router.get('/:coinId', coinController.getCoinProfile);
router.get('/:coinId/news', coinController.getCoinNews);

export default router;

