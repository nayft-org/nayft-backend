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
router.get('/holdings',        authenticate, portfolioController.getHoldings);
router.post('/events/refresh-status', authenticate, portfolioController.refreshEventStatuses);

// CoinDCX / exchange connections (gated by EXCHANGE_PORTFOLIO_ENABLED in controller)
router.get('/exchanges',                    authenticate, portfolioController.getExchanges);
router.post('/exchanges/coindcx/validate',  authenticate, portfolioController.validateCoinDcx);
router.post('/exchanges/coindcx',           authenticate, portfolioController.addCoinDcx);
router.patch('/exchanges/coindcx/:id',      authenticate, portfolioController.patchCoinDcx);
router.delete('/exchanges/:id',            authenticate, portfolioController.removeExchange);

// Unauthenticated webhook receivers — called directly by Alchemy and Zerion
// Signature verification is handled inside each controller handler
router.post('/webhooks/alchemy', webhookController.alchemyWebhook);
router.post('/webhooks/zerion',  webhookController.zerionWebhook);

export default router;
