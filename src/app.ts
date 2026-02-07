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

const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
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

// Error handling
app.use(notFound);
app.use(errorHandler);

export default app;

