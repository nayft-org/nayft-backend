import cron from 'node-cron';
import http from 'http';
import app from './app';
import { connectDatabase } from './config/database';
import { config } from './config/env';
import { attachWebSocketServer } from './websocket/server';
import { binanceWebSocket } from './services/binanceWebSocket';
import { registerAdapter, startStreams } from './services/streams/registry';
import { BinanceKlineAdapter } from './services/streams/adapters';
import { runKlineDownsampler } from './services/streams/jobs/klineDownsampler';
import { streamConfig } from './config/streamConfig';

const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDatabase();

    // Register and start kline stream adapters
    registerAdapter('binance', new BinanceKlineAdapter());
    startStreams();

    // Create HTTP server
    const httpServer = http.createServer(app);
    attachWebSocketServer(httpServer);
    binanceWebSocket.start();

    // Schedule KlineDownsampler (cascading aggregation)
    cron.schedule(streamConfig.kline.downsamplerCron, () => {
      runKlineDownsampler().catch((err) => console.error('[KlineDownsampler]', err));
    });
    console.log(`📊 KlineDownsampler scheduled: ${streamConfig.kline.downsamplerCron}`);

    const port = config.port;
    httpServer.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
      console.log(`📡 Environment: ${config.nodeEnv}`);
      console.log(`🔗 API: http://localhost:${port}/api`);
      console.log(`🔌 WebSocket: ws://localhost:${port}/ws`);
      console.log(`📈 Charts: http://localhost:${port}/api/charts/klines`);
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
