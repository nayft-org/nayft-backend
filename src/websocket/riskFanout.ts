import type { WebSocket } from 'ws';
import { redis } from '../config/redis';
import { riskRedisKeys } from '../modules/risk/cache/riskRedisKeys';

type RiskClient = WebSocket & { riskSubscribed?: boolean };

let subscriberStarted = false;

export function attachRiskFanout(wss: { clients: Set<WebSocket> }): void {
  if (subscriberStarted) return;
  subscriberStarted = true;

  const sub = redis.duplicate();
  sub.subscribe(riskRedisKeys.feedChannel, (err) => {
    if (err) console.error('[RiskFanout] subscribe failed', err);
  });

  sub.on('message', (channel, message) => {
    if (channel !== riskRedisKeys.feedChannel) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    const payload = JSON.stringify({
      channel: 'risk',
      type: 'risk:revision',
      payload: parsed,
    });
    for (const client of wss.clients) {
      const c = client as RiskClient;
      if (c.readyState === 1 && c.riskSubscribed) {
        c.send(payload);
      }
    }
  });
}

export function handleRiskWsMessage(ws: RiskClient, msg: { type?: string }): boolean {
  if (msg.type === 'risk_subscribe') {
    ws.riskSubscribed = true;
    ws.send(JSON.stringify({ channel: 'risk', type: 'risk:subscribed' }));
    return true;
  }
  if (msg.type === 'risk_unsubscribe') {
    ws.riskSubscribed = false;
    return true;
  }
  return false;
}
