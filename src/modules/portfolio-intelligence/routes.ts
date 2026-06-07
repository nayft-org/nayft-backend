import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { requireEmailVerified } from '../auth/middleware/requireEmailVerified';
import { piContextController } from './controllers/piContext.controller';

const router = Router();
const piAuth = [authenticate, requireEmailVerified];

router.get('/context', piAuth, piContextController.getContext);
router.get('/snapshot/latest', piAuth, piContextController.getLatestSnapshot);
router.get('/summary', piAuth, piContextController.getSummary);
router.get('/insights', piAuth, piContextController.getInsights);
router.post('/recompute', piAuth, piContextController.manualRecompute);

export default router;
