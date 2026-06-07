import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { requireEmailVerified } from '../auth/middleware/requireEmailVerified';
import { onboardingController } from './controller';

const router = Router();

router.post('/complete', authenticate, requireEmailVerified, onboardingController.complete);

export default router;
