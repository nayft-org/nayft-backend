import { Router } from 'express';
import { metricsController } from './controller';
import { adminAuth } from '../../middlewares/adminAuth';

const router = Router();

router.use(adminAuth);
router.get('/', metricsController.getMetrics);

export default router;
