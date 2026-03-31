import { Router } from 'express';
import { optionalAuth } from '../../middlewares/auth';
import { searchController } from './controller';

const router = Router();

router.get('/', optionalAuth, searchController.search);

export default router;
