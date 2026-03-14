import { Router } from 'express';
import { portfolioController } from './controller';
import { webhookController } from './webhookController';
import { authenticate } from '../../middlewares/auth';

const router = Router();

// Authenticated portfolio management endpoints
router.get('/chains',          authenticate, portfolioController.getSupportedChains);
router.get('/wallets',         authenticate, portfolioController.getWallets);
router.post('/wallets',        authenticate, portfolioController.addWallet);
router.delete('/wallets/:id',  authenticate, portfolioController.removeWallet);
router.get('/events',          authenticate, portfolioController.getEvents);
router.post('/events/refresh-status', authenticate, portfolioController.refreshEventStatuses);

// Unauthenticated webhook receivers — called directly by Alchemy and Zerion
// Signature verification is handled inside each controller handler
router.post('/webhooks/alchemy', webhookController.alchemyWebhook);
router.post('/webhooks/zerion',  webhookController.zerionWebhook);

export default router;
