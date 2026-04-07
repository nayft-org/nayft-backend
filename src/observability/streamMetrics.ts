import { monitorEventLoopDelay } from 'perf_hooks';

const elMonitor = monitorEventLoopDelay({ resolution: 20 });
elMonitor.enable();

export const streamMetrics = {
  /** Binance inbound (worker) or Redis message bytes (API). */
  inboundBytesTotal: 0,
  inboundMessagesTotal: 0,
  outboundBytesTotal: 0,
  outboundMessagesTotal: 0,
  redisPublishTotal: 0,
  connectedWsClients: 0,
  /** Max observed kline buffer length (sampled on push). */
  klineBufferHighWater: 0,
  /** Max observed aggTrade buffer length. */
  aggTradeBufferHighWater: 0,
  klineDroppedEventsTotal: 0,
  aggTradeDroppedEventsTotal: 0,
  klineMongoRetryExhaustedTotal: 0,
  aggTradeMongoRetryExhaustedTotal: 0,
};

export function recordInbound(bytes: number): void {
  streamMetrics.inboundBytesTotal += bytes;
  streamMetrics.inboundMessagesTotal += 1;
}

export function recordOutbound(bytes: number): void {
  streamMetrics.outboundBytesTotal += bytes;
  streamMetrics.outboundMessagesTotal += 1;
}

export function recordRedisPublish(): void {
  streamMetrics.redisPublishTotal += 1;
}

export function getStreamMetricsSnapshot(): Record<string, unknown> {
  const mean = elMonitor.mean / 1e6;
  const max = elMonitor.max / 1e6;
  elMonitor.reset();
  return {
    eventLoopLagMsMean: Math.round(mean * 1000) / 1000,
    eventLoopLagMsMax: Math.round(max * 1000) / 1000,
    inboundBytesTotal: streamMetrics.inboundBytesTotal,
    inboundMessagesTotal: streamMetrics.inboundMessagesTotal,
    outboundBytesTotal: streamMetrics.outboundBytesTotal,
    outboundMessagesTotal: streamMetrics.outboundMessagesTotal,
    redisPublishTotal: streamMetrics.redisPublishTotal,
    connectedWsClients: streamMetrics.connectedWsClients,
    klineBufferHighWater: streamMetrics.klineBufferHighWater,
    aggTradeBufferHighWater: streamMetrics.aggTradeBufferHighWater,
    klineDroppedEventsTotal: streamMetrics.klineDroppedEventsTotal,
    aggTradeDroppedEventsTotal: streamMetrics.aggTradeDroppedEventsTotal,
    klineMongoRetryExhaustedTotal: streamMetrics.klineMongoRetryExhaustedTotal,
    aggTradeMongoRetryExhaustedTotal: streamMetrics.aggTradeMongoRetryExhaustedTotal,
  };
}
