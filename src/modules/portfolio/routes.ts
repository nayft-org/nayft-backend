import { Router } from 'express';
import { portfolioController } from './controller';
import { authenticate } from '../../middlewares/auth';

const router = Router();

router.get('/chains',          authenticate, portfolioController.getSupportedChains);
router.get('/wallets',         authenticate, portfolioController.getWallets);
router.post('/wallets',        authenticate, portfolioController.addWallet);
router.delete('/wallets/:id',  authenticate, portfolioController.removeWallet);
router.get('/events',          authenticate, portfolioController.getEvents);

export default router;
