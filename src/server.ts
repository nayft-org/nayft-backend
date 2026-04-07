import cron from 'node-cron';
import http from 'http';
import app from './app';
import { connectDatabase } from './config/database';
import { config } from './config/env';
import { attachWebSocketServer } from './websocket/server';
import { runKlineDownsampler } from './services/streams/jobs/klineDownsampler';
import { streamConfig } from './config/streamConfig';
import { bootstrapFeatures } from './core/bootstrapFeatures';
import { bootstrapPlans } from './core/bootstrapPlans';
import { runEventWorker } from './core/event-system/eventWorker';

const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDatabase();

    // Auto-register features from modules
    await bootstrapFeatures();

    // Seed plans if empty
    await bootstrapPlans();

    // Start event queue worker (non-blocking)
    setImmediate(() => runEventWorker().catch((err) => console.error('[EventWorker] Fatal:', err)));

    // Create HTTP server (Binance ingestion runs in `npm run worker:streams`)
    const httpServer = http.createServer(app);
    attachWebSocketServer(httpServer);
    // Wallet monitoring is now driven by Alchemy/Zerion webhooks — no polling needed

    // Schedule KlineDownsampler (cascading aggregation)
    cron.schedule(streamConfig.kline.downsamplerCron, () => {
      runKlineDownsampler().catch((err) => console.error('[KlineDownsampler]', err));
    });
    console.log(`📊 KlineDownsampler scheduled: ${streamConfig.kline.downsamplerCron}`);

    const port = config.port;
    const host = config.host;
    httpServer.listen(port, host, () => {
      console.log(`🚀 Server listening on http://${host}:${port}`);
      console.log(`📡 Environment: ${config.nodeEnv}`);
      console.log(`🔗 API: http://${host}:${port}/api`);
      console.log(`🔌 WebSocket: ws://${host}:${port}/ws`);
      console.log(`📈 Charts: http://${host}:${port}/api/charts/klines`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// this line is used to understand the commit history
// this line is used to understand the commit history
// this line is used to understand the commit history
