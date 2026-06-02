import { Router } from 'express';
import { adminAuth } from '../../middlewares/adminAuth';
import { sentimentAdminController } from './controllers/sentimentAdmin.controller';

const router = Router();
router.use(adminAuth);

router.get('/health', sentimentAdminController.health);
router.post('/reprocess', sentimentAdminController.reprocess);
router.post('/aggregate', sentimentAdminController.aggregate);

export default router;
