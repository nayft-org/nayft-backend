import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { piContextController } from './controllers/piContext.controller';

const router = Router();

router.get('/context', authenticate, piContextController.getContext);
router.get('/snapshot/latest', authenticate, piContextController.getLatestSnapshot);
router.get('/summary', authenticate, piContextController.getSummary);
router.get('/insights', authenticate, piContextController.getInsights);
router.post('/recompute', authenticate, piContextController.manualRecompute);

export default router;
