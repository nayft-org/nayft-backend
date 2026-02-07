import { Router } from 'express';
import { wishlistController } from './controller';
import { authenticate } from '../../middlewares/auth';

const router = Router();

router.post('/:coinId', authenticate, wishlistController.addToWishlist);
router.delete('/:coinId', authenticate, wishlistController.removeFromWishlist);
router.get('/', authenticate, wishlistController.getWishlist);

export default router;

