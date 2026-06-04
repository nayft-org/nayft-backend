import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { piContextController } from './controllers/piContext.controller';

const router = Router();

router.get('/context', authenticate, piContextController.getContext);
router.get('/snapshot/latest', authenticate, piContextController.getLatestSnapshot);
router.post('/recompute', authenticate, piContextController.manualRecompute);

export default router;
