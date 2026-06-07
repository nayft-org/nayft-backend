import { Router } from 'express';
import { portfolioController } from './controller';
import { webhookController } from './webhookController';
import { authenticate } from '../../middlewares/auth';
import { requireEmailVerified } from '../auth/middleware/requireEmailVerified';

const router = Router();
const portfolioAuth = [authenticate, requireEmailVerified];

// Authenticated portfolio management endpoints
router.get('/chains',          portfolioAuth, portfolioController.getSupportedChains);
router.get('/wallets',         portfolioAuth, portfolioController.getWallets);
router.post('/wallets',        portfolioAuth, portfolioController.addWallet);
router.delete('/wallets/:id',  portfolioAuth, portfolioController.removeWallet);
router.get('/events',          portfolioAuth, portfolioController.getEvents);
router.get('/holdings',        portfolioAuth, portfolioController.getHoldings);
router.post('/events/refresh-status', portfolioAuth, portfolioController.refreshEventStatuses);

// CoinDCX / exchange connections (gated by EXCHANGE_PORTFOLIO_ENABLED in controller)
router.get('/exchanges',                    portfolioAuth, portfolioController.getExchanges);
router.post('/exchanges/coindcx/validate',  portfolioAuth, portfolioController.validateCoinDcx);
router.post('/exchanges/coindcx',           portfolioAuth, portfolioController.addCoinDcx);
router.patch('/exchanges/coindcx/:id',      portfolioAuth, portfolioController.patchCoinDcx);
router.delete('/exchanges/:id',            portfolioAuth, portfolioController.removeExchange);

// Unauthenticated webhook receivers — called directly by Alchemy and Zerion
// Signature verification is handled inside each controller handler
router.post('/webhooks/alchemy', webhookController.alchemyWebhook);
router.post('/webhooks/zerion',  webhookController.zerionWebhook);

export default router;
