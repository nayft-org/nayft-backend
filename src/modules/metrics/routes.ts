import { Router } from 'express';
import { metricsController } from './controller';

const router = Router();

router.get('/', metricsController.getMetrics);

export default router;
