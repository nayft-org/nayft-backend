import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { requireEmailVerified } from '../auth/middleware/requireEmailVerified';
import { followController } from './controller';

const router = Router();
const followAuth = [authenticate, requireEmailVerified];

router.post('/coins/:coinId', followAuth, followController.followCoin);
router.delete('/coins/:coinId', followAuth, followController.unfollowCoin);
router.get('/coins', followAuth, followController.getFollowedCoins);
router.get('/coins/:coinId/followers', followAuth, followController.getCoinFollowers);
router.get('/coins/:coinId/stats', followAuth, followController.getCoinFollowStats);

router.post('/users/:userId', followAuth, followController.followUser);
router.delete('/users/:userId', followAuth, followController.unfollowUser);
router.get('/users', followAuth, followController.getFollowedUsers);
router.get('/users/:userId/followers', followAuth, followController.getUserFollowers);
router.get('/users/:userId/stats', followAuth, followController.getUserFollowStats);

export default router;
