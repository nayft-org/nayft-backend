import type { WebSocket } from 'ws';
import { redis } from '../config/redis';
import { piRedisKeys } from '../modules/portfolio-intelligence/cache/piRedisKeys';
import { piConfig } from '../modules/portfolio-intelligence/config/piConfig';
import { piMetrics } from '../observability/piMetrics';

type PortfolioFanoutClient = WebSocket & {
  portfolioAddresses?: Set<string>;
  portfolioFanoutSubscribed?: boolean;
};

let subscriberStarted = false;

export function attachPortfolioFanout(wss: { clients: Set<WebSocket> }): void {
  if (subscriberStarted || !piConfig.fanoutEnabled) return;
  subscriberStarted = true;

  const sub = redis.duplicate();
  sub.subscribe(piRedisKeys.fanoutChannel, (err) => {
    if (err) console.error('[PortfolioFanout] subscribe failed', err);
    else console.log('[PortfolioFanout] subscribed', piRedisKeys.fanoutChannel);
  });

  sub.on('message', (channel, message) => {
    if (channel !== piRedisKeys.fanoutChannel) return;
    let parsed: { userId?: string; type?: string };
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    if (!parsed.userId) return;

    const payload = JSON.stringify({
      channel: 'portfolio',
      ...parsed,
    });

    for (const client of wss.clients) {
      const c = client as PortfolioFanoutClient;
      if (c.readyState !== 1) continue;
      if (!c.portfolioFanoutSubscribed && !c.portfolioAddresses?.size) continue;
      c.send(payload);
      piMetrics.fanoutMessage();
    }
  });
}

export function markPortfolioFanoutClient(ws: PortfolioFanoutClient): void {
  ws.portfolioFanoutSubscribed = true;
}
