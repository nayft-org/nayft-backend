import { Router } from 'express';
import { rewardsController } from './controller';
import { authenticate } from '../../middlewares/auth';

const router = Router();

router.get('/', authenticate, rewardsController.getRewards);
router.post('/claim', authenticate, rewardsController.claimReward);

export default router;

