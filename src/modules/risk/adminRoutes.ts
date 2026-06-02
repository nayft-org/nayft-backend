import { Router } from 'express';
import { adminAuth } from '../../middlewares/adminAuth';
import { riskAdminController } from './controllers/riskAdmin.controller';

const router = Router();

router.use(adminAuth);
router.get('/health', riskAdminController.health);
router.post('/recalculate', riskAdminController.recalculate);
router.post('/replay', riskAdminController.replay);

export default router;
