import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { deviceSessionsController } from './deviceSessions.controller';

const router = Router();

router.use(authenticate);
router.post('/', deviceSessionsController.upsert);
router.delete('/:deviceId', deviceSessionsController.remove);

export default router;
