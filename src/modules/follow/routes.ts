import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { followController } from './controller';

const router = Router();

router.post('/coins/:coinId', authenticate, followController.followCoin);
router.delete('/coins/:coinId', authenticate, followController.unfollowCoin);
router.get('/coins', authenticate, followController.getFollowedCoins);
router.get('/coins/:coinId/followers', authenticate, followController.getCoinFollowers);
router.get('/coins/:coinId/stats', authenticate, followController.getCoinFollowStats);

router.post('/users/:userId', authenticate, followController.followUser);
router.delete('/users/:userId', authenticate, followController.unfollowUser);
router.get('/users', authenticate, followController.getFollowedUsers);
router.get('/users/:userId/followers', authenticate, followController.getUserFollowers);
router.get('/users/:userId/stats', authenticate, followController.getUserFollowStats);

export default router;
