import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { requireEmailVerified } from '../auth/middleware/requireEmailVerified';
import { interestProfileController } from './controllers/interestProfile.controller';

const router = Router();
router.use(authenticate, requireEmailVerified);

router.get('/', interestProfileController.getProfile);
router.post('/signals', interestProfileController.syncSignals);
router.post('/recompute', interestProfileController.recompute);

export default router;
