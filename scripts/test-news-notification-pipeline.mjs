#!/usr/bin/env node
/**
 * Verifies the new-news realtime path (Redis → WS fanout → news:new).
 * Also reports whether mobile PUSH delivery is wired (Expo/FCM) for news events.
 *
 * Usage:
 *   node scripts/test-news-notification-pipeline.mjs
 *   WS_URL=ws://localhost:4001/ws API_URL=http://localhost:4001/api/news/store-news node scripts/test-news-notification-pipeline.mjs
 */
import WebSocket from 'ws';
import Redis from 'ioredis';

const WS_URL = process.env.WS_URL ?? 'ws://localhost:4001/ws';
const API_URL = process.env.API_URL ?? 'http://localhost:4001/api/news/store-news';
const REDIS_URL = process.env.REDIS_URL ?? process.env.REDIS_URI ?? 'redis://127.0.0.1:6380';
const NEWS_CHANNEL = 'news:feed';
const WAIT_MS = 8000;

const results = {
  wsConnected: false,
  newsSubscribed: false,
  storeNewsHttp: null,
  redisPublishOk: false,
  newsNewReceived: false,
  receivedPayload: null,
  pushChannelImplemented: false,
  newsPushRuleExists: false,
};

function log(section, msg) {
  console.log(`[${section}] ${msg}`);
}

async function testWebSocketNewsFanout() {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    const timer = setTimeout(() => {
      ws.close();
      resolve();
    }, WAIT_MS);

    ws.on('open', () => {
      results.wsConnected = true;
      ws.send(JSON.stringify({ type: 'news_subscribe' }));
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'news_subscribed') {
          results.newsSubscribed = true;
          log('ws', 'subscribed to news fanout');
        }
        if (msg.type === 'news:new') {
          results.newsNewReceived = true;
          results.receivedPayload = msg;
          log('ws', `received news:new inserted=${msg.inserted}`);
          clearTimeout(timer);
          ws.close();
          resolve();
        }
      } catch {
        /* ignore */
      }
    });

    ws.on('error', (err) => {
      log('ws', `error: ${err.message}`);
    });
  });
}

async function publishSyntheticNewsEvent() {
  const client = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 });
  const payload = JSON.stringify({
    channel: 'news',
    type: 'news:new',
    inserted: 3,
    emittedAt: new Date().toISOString(),
  });
  const receivers = await client.publish(NEWS_CHANNEL, payload);
  results.redisPublishOk = Number(receivers) >= 0;
  log('redis', `published to ${NEWS_CHANNEL} (subscribers=${receivers})`);
  await client.quit();
}

async function triggerStoreNews() {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const body = await res.json().catch(() => ({}));
  results.storeNewsHttp = {
    status: res.status,
    ok: res.ok,
    data: body?.data ?? body,
  };
  log('http', `store-news status=${res.status} inserted=${body?.data?.inserted ?? '?'}`);
}

async function inspectPushImplementation() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = path.resolve(import.meta.dirname, '..');
  const pushChannel = fs.readFileSync(
    path.join(root, 'src/services/notificationEngine/channels/PushChannel.ts'),
    'utf8'
  );
  results.pushChannelImplemented = !pushChannel.includes('skipped: true');
  const rules = fs.readFileSync(
    path.join(root, 'src/services/notificationEngine/RuleEvaluator.ts'),
    'utf8'
  );
  results.newsPushRuleExists = /news\.|news_/i.test(rules);
}

async function main() {
  console.log('=== NAYFT news notification pipeline test ===\n');

  await inspectPushImplementation();

  const wsPromise = testWebSocketNewsFanout();
  await new Promise((r) => setTimeout(r, 400));
  await publishSyntheticNewsEvent();
  await wsPromise;
  await triggerStoreNews();

  console.log('\n=== Results ===');
  console.log(JSON.stringify(results, null, 2));

  const realtimeOk =
    results.wsConnected && results.newsSubscribed && results.newsNewReceived;
  const pushOk = results.pushChannelImplemented && results.newsPushRuleExists;

  console.log('\n=== Verdict ===');
  if (realtimeOk) {
    console.log('PASS — WebSocket news:new fanout works when news is published to Redis.');
  } else {
    console.log('FAIL — WebSocket did not receive news:new (check API/Redis/WS server).');
  }

  if (pushOk) {
    console.log('PASS — Push channel and news notification rules appear implemented.');
  } else {
    console.log(
      'NOT IMPLEMENTED — Device push for new articles is not wired. In-app notification WS exists for wallet/social events only; PushChannel is currently a stub.'
    );
  }

  if (results.storeNewsHttp?.data?.inserted > 0) {
    console.log(
      `INFO — store-news inserted ${results.storeNewsHttp.data.inserted} articles (production path would also publish news:new).`
    );
  } else {
    console.log(
      'INFO — store-news inserted 0 articles this run, so production ingest did not emit news:new (upserts only). Synthetic Redis publish was used for WS test.'
    );
  }

  process.exit(realtimeOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
