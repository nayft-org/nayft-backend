import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { onboardingController } from './controller';

const router = Router();

router.post('/complete', authenticate, onboardingController.complete);

export default router;
