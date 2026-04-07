import { Server as HttpServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { redis } from '../config/redis';
import { streamConfig } from '../config/streamConfig';
import { STREAM_PRICE_SYMREF_KEY, STREAM_PRICES_BATCH_CHANNEL } from '../streaming/redisKeys';
import { subscribeToWalletEvents } from '../services/walletEventAggregator';
import { IWalletEvent } from '../modules/portfolio/models/WalletEvent';
import { streamMetrics, recordOutbound, recordInbound } from '../observability/streamMetrics';

const WS_PATH = '/ws';
const SUBSCRIBE_IDLE_MS = 5000;

export interface PriceUpdateMessage {
  type: 'price';
  updates: Array<{ symbol: string; price: number; percentChange24h: number }>;
}

export interface SnapshotMessage {
  type: 'snapshot';
  prices: Record<string, { price: number; percentChange24h: number }>;
}

export interface WalletEventMessage {
  type: 'wallet_event';
  event: IWalletEvent;
}

/** Per-client symbol subscription for viewport-aware price updates */
const clientSymbols = new WeakMap<WebSocket, Set<string>>();

/** Per-client portfolio address subscription */
const clientAddresses = new WeakMap<WebSocket, Set<string>>();

let wssInstance: WebSocketServer | null = null;

/** Latest quotes from Redis (worker-published batches). */
const latestPrices = new Map<string, { price: number; percentChange24h: number }>();
const dirtySymbols = new Set<string>();

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let redisSubscriber: ReturnType<typeof redis.duplicate> | null = null;

function getClientSymbols(ws: WebSocket): Set<string> {
  let set = clientSymbols.get(ws);
  if (!set) {
    set = new Set();
    clientSymbols.set(ws, set);
  }
  return set;
}

function getClientAddresses(ws: WebSocket): Set<string> {
  let set = clientAddresses.get(ws);
  if (!set) {
    set = new Set();
    clientAddresses.set(ws, set);
  }
  return set;
}

function schedulePriceFlush(): void {
  if (flushTimer) return;
  const ms = Math.max(50, streamConfig.priceWsFlushMs);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushPriceUpdates();
  }, ms);
}

function flushPriceUpdates(): void {
  if (!wssInstance || dirtySymbols.size === 0) return;
  const affected = new Set(dirtySymbols);
  dirtySymbols.clear();

  const group = new Map<string, WebSocket[]>();
  wssInstance.clients.forEach((client: WebSocket) => {
    if (client.readyState !== WebSocket.OPEN) return;
    const symbols = getClientSymbols(client);
    if (symbols.size === 0) return;
    const key = [...symbols].sort().join('\0');
    if (!group.has(key)) group.set(key, []);
    group.get(key)!.push(client);
  });

  for (const [symKey, clients] of group) {
    const symSet = new Set(symKey.split('\0'));
    const updates: PriceUpdateMessage['updates'] = [];
    for (const s of symSet) {
      if (!affected.has(s)) continue;
      const q = latestPrices.get(s);
      if (!q) continue;
      updates.push({ symbol: s, price: q.price, percentChange24h: q.percentChange24h });
    }
    if (updates.length === 0) continue;
    const msg: PriceUpdateMessage = { type: 'price', updates };
    const payload = JSON.stringify(msg);
    const bytes = Buffer.byteLength(payload, 'utf8');
    for (const c of clients) {
      if (c.readyState === WebSocket.OPEN) {
        c.send(payload);
        recordOutbound(bytes);
      }
    }
  }
}

function applyRedisPricesMessage(raw: string): void {
  try {
    const parsed = JSON.parse(raw) as { updates?: Array<{ symbol: string; price: number; percentChange24h: number }> };
    if (!parsed.updates || !Array.isArray(parsed.updates)) return;
    for (const u of parsed.updates) {
      if (!u.symbol) continue;
      const sym = u.symbol.toUpperCase();
      latestPrices.set(sym, { price: u.price, percentChange24h: u.percentChange24h });
      dirtySymbols.add(sym);
    }
    schedulePriceFlush();
  } catch {
    /* ignore */
  }
}

function startRedisPriceSubscriber(): void {
  if (redisSubscriber) return;
  const sub = redis.duplicate();
  redisSubscriber = sub;
  sub.on('message', (_channel: string, message: string) => {
    recordInbound(Buffer.byteLength(message, 'utf8'));
    applyRedisPricesMessage(message);
  });
  sub.subscribe(STREAM_PRICES_BATCH_CHANNEL, (err) => {
    if (err) {
      console.error('[WS] Redis subscribe failed:', err);
    } else {
      console.log(`[WS] Subscribed to ${STREAM_PRICES_BATCH_CHANNEL}`);
    }
  });
}

function symrefDelta(symbol: string, delta: number): void {
  void redis.hincrby(STREAM_PRICE_SYMREF_KEY, symbol, delta).catch((err) => {
    console.error('[WS] symref update failed:', err);
  });
}

function replaceClientSymbols(ws: WebSocket, newSymbols: string[]): void {
  const old = getClientSymbols(ws);
  const oldArr = [...old];
  const newSet = new Set(newSymbols.map((s) => s.trim().toUpperCase()).filter(Boolean));
  for (const s of oldArr) {
    if (!newSet.has(s)) {
      old.delete(s);
      symrefDelta(s, -1);
    }
  }
  for (const s of newSet) {
    if (!old.has(s)) {
      old.add(s);
      symrefDelta(s, 1);
    }
  }
}

function sendFilteredSnapshot(ws: WebSocket): void {
  const syms = getClientSymbols(ws);
  const prices: SnapshotMessage['prices'] = {};
  for (const s of syms) {
    const q = latestPrices.get(s);
    if (q) prices[s] = { price: q.price, percentChange24h: q.percentChange24h };
  }
  const snap: SnapshotMessage = { type: 'snapshot', prices };
  const payload = JSON.stringify(snap);
  recordOutbound(Buffer.byteLength(payload, 'utf8'));
  ws.send(payload);
}

/**
 * Push an aggregated wallet event to all clients subscribed to that address.
 */
export function broadcastWalletEvent(event: IWalletEvent): void {
  if (!wssInstance) return;
  const msg: WalletEventMessage = { type: 'wallet_event', event };
  const payload = JSON.stringify(msg);
  const bytes = Buffer.byteLength(payload, 'utf8');

  wssInstance.clients.forEach((client: WebSocket) => {
    if (client.readyState !== WebSocket.OPEN) return;
    const addrs = clientAddresses.get(client);
    if (addrs && addrs.has(event.address.toLowerCase())) {
      client.send(payload);
      recordOutbound(bytes);
    }
  });
}

export function attachWebSocketServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });
  wssInstance = wss;
  startRedisPriceSubscriber();

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = request.url?.split('?')[0];
    if (pathname === WS_PATH) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  subscribeToWalletEvents((event) => broadcastWalletEvent(event));

  wss.on('connection', (ws: WebSocket) => {
    streamMetrics.connectedWsClients += 1;

    const idleTimer = setTimeout(() => {
      const syms = clientSymbols.get(ws);
      const addrs = clientAddresses.get(ws);
      const hasPrice = syms && syms.size > 0;
      const hasPortfolio = addrs && addrs.size > 0;
      if (!hasPrice && !hasPortfolio) {
        ws.close(4408, 'subscription required');
      }
    }, SUBSCRIBE_IDLE_MS);

    const clearIdle = (): void => {
      clearTimeout(idleTimer);
    };

    ws.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;

        if (msg.type === 'subscribe' && Array.isArray(msg.symbols)) {
          const list = msg.symbols.filter((s): s is string => typeof s === 'string' && s.length > 0);
          replaceClientSymbols(ws, list);
          if (list.length > 0) {
            clearIdle();
            sendFilteredSnapshot(ws);
          }
        }

        if (msg.type === 'portfolio_subscribe' && Array.isArray(msg.addresses)) {
          const set = getClientAddresses(ws);
          set.clear();
          for (const a of msg.addresses) {
            if (typeof a === 'string' && a) set.add(a.toLowerCase());
          }
          if (set.size > 0) clearIdle();
        }

        if (msg.type === 'portfolio_unsubscribe') {
          const set = clientAddresses.get(ws);
          if (set) set.clear();
        }
      } catch {
        /* ignore malformed */
      }
    });

    ws.on('close', () => {
      streamMetrics.connectedWsClients -= 1;
      const syms = clientSymbols.get(ws);
      if (syms) {
        for (const s of syms) {
          symrefDelta(s, -1);
        }
        syms.clear();
      }
      clientSymbols.delete(ws);
      clientAddresses.delete(ws);
    });
  });
}
