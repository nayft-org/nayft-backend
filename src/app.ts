import express, { Application } from 'express';
import cors from 'cors';
import { config } from './config/env';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';

// Routes
import authRoutes from './modules/auth/routes';
import marketRoutes from './modules/market/routes';
import coinRoutes from './modules/coin/routes';
import newsRoutes from './modules/news/routes';
import searchRoutes from './modules/search/routes';
import wishlistRoutes from './modules/wishlist/routes';
import rewardsRoutes from './modules/rewards/routes';
import userRoutes from './modules/user/routes';
import newsBoardRoutes from './modules/newsboard/routes';
import commentRoutes from './modules/comment/routes';
import reactionRoutes from './modules/reaction/routes';
import chartRoutes from './modules/chart/routes';
import portfolioRoutes from './modules/portfolio/routes';
import followRoutes from './modules/follow/routes';
import metricsRoutes from './modules/metrics/routes';

const app: Application = express();

// CORS Configuration
const isWildcard = config.frontendUrls.length === 1 && config.frontendUrls[0] === '*';

const corsOptions = {
  origin: isWildcard ? true : config.frontendUrls,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

console.log('CORS Options:', corsOptions);

// Middleware
app.use(cors(corsOptions));
// Attach raw body buffer to req so webhook controllers can verify HMAC signatures
app.use(express.json({
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/coins', coinRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/rewards', rewardsRoutes);
app.use('/api/user', userRoutes);
app.use('/api/newsboards', newsBoardRoutes);
app.use('/api/news', commentRoutes);
app.use('/api/news', reactionRoutes);
app.use('/api/charts', chartRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/follow', followRoutes);
app.use('/api/metrics', metricsRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

export default app;

