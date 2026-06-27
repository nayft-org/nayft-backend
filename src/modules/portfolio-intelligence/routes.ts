import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { requireEmailVerified } from '../auth/middleware/requireEmailVerified';
import { piContextController } from './controllers/piContext.controller';
import { piAnalyticsController } from './controllers/piAnalytics.controller';
import { piGoalController } from './controllers/piGoal.controller';
import { piSimulationController } from './controllers/piSimulation.controller';
import { piAiAnalystController } from './controllers/piAiAnalyst.controller';

const router = Router();
const piAuth = [authenticate, requireEmailVerified];

router.get('/context', piAuth, piContextController.getContext);
router.get('/snapshot/latest', piAuth, piContextController.getLatestSnapshot);
router.get('/summary', piAuth, piContextController.getSummary);
router.get('/insights', piAuth, piContextController.getInsights);
router.post('/recompute', piAuth, piContextController.manualRecompute);

router.get('/health', piAuth, piAnalyticsController.getHealth);
router.get('/risk', piAuth, piAnalyticsController.getRisk);
router.get('/allocation', piAuth, piAnalyticsController.getAllocation);
router.get('/narrative', piAuth, piAnalyticsController.getNarrative);
router.get('/identity', piAuth, piAnalyticsController.getIdentity);
router.get('/evolution', piAuth, piAnalyticsController.getEvolution);
router.get('/confidence', piAuth, piAnalyticsController.getConfidence);
router.get('/explain', piAuth, piAnalyticsController.getExplain);
router.get('/explain/:engineId', piAuth, piAnalyticsController.getExplain);
router.get('/benchmarks', piAuth, piAnalyticsController.getBenchmarks);
router.get('/opportunities', piAuth, piAnalyticsController.getOpportunities);
router.get('/goal', piAuth, piGoalController.getGoal);
router.put('/goal', piAuth, piGoalController.setGoal);
router.get('/feed-context', piAuth, piAnalyticsController.getFeedContext);
router.get('/narrative-intel', piAuth, piAnalyticsController.getNarrativeIntel);
router.get('/history/:dimension', piAuth, piAnalyticsController.getHistory);

router.post('/simulate', piAuth, piSimulationController.simulate);
router.get('/simulate/:id', piAuth, piSimulationController.getSimulation);

router.get('/ai-context', piAuth, piAiAnalystController.getContext);
router.post('/ai/chat', piAuth, piAiAnalystController.chat);

export default router;
