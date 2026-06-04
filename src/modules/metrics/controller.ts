import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { redis } from '../../config/redis';
import { getHttpPerformanceSnapshot } from '../../utils/httpPerformanceStats';
import { getTranslationMetricsSnapshot } from '../../i18n/translationMetrics';
import { getStreamMetricsSnapshot } from '../../observability/streamMetrics';
import { notifMetrics } from '../../observability/notifMetrics';
import { piMetrics } from '../../observability/piMetrics';

export const metricsController = {
  getMetrics: async (_req: Request, res: Response): Promise<void> => {
    try {
      // MongoDB connection pool info
      const mongoStatus = {
        connected: mongoose.connection.readyState === 1,
        readyState: mongoose.connection.readyState,
        maxPoolSize: 50,
        minPoolSize: 10,
        name: mongoose.connection.name,
      };

      // Redis stats
      let redisStats = {
        connected: false,
        uptime: 0,
        keyspaceHits: 0,
        keyspaceMisses: 0,
        hitRate: '0.00%',
        usedMemory: '0',
        connectedClients: 0,
      };

      try {
        const info = await redis.info();
        const stats = info.match(/keyspace_hits:(\d+)/);
        const misses = info.match(/keyspace_misses:(\d+)/);
        const uptime = info.match(/uptime_in_seconds:(\d+)/);
        const memory = info.match(/used_memory_human:([\d.]+[KMG])/);
        const clients = info.match(/connected_clients:(\d+)/);

        const hits = parseInt(stats?.[1] || '0');
        const missCount = parseInt(misses?.[1] || '0');
        const total = hits + missCount;
        const hitRate = total > 0 ? ((hits / total) * 100).toFixed(2) : '0.00';

        redisStats = {
          connected: true,
          uptime: parseInt(uptime?.[1] || '0'),
          keyspaceHits: hits,
          keyspaceMisses: missCount,
          hitRate: `${hitRate}%`,
          usedMemory: memory?.[1] || '0',
          connectedClients: parseInt(clients?.[1] || '0'),
        };
      } catch (error) {
        console.error('Redis metrics error:', error);
      }

      // Process info
      const processInfo = {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        version: process.version,
        pid: process.pid,
      };

      const httpPerf = getHttpPerformanceSnapshot();
      const stream = getStreamMetricsSnapshot();
      const translation = getTranslationMetricsSnapshot();

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        data: {
          mongodb: mongoStatus,
          redis: redisStats,
          process: processInfo,
          http: httpPerf,
          stream,
          translation,
          notifications: { ...notifMetrics },
          portfolioIntelligence: piMetrics.getSnapshot(),
          performance: {
            targets: {
              p50ResponseTime: '<50ms',
              p95ResponseTime: '<150ms',
              cacheHitRate: '>80%',
            },
          },
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
};
