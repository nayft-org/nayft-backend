import { Server as HttpServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { redis } from '../config/redis';
import { streamConfig } from '../config/streamConfig';
import { STREAM_PRICE_SYMREF_KEY, STREAM_PRICES_BATCH_CHANNEL } from '../streaming/redisKeys';
import {
  PortfolioRealtimeMessage,
  subscribeToPortfolioRealtime,
} from '../services/walletEventAggregator';
import { IWalletEvent } from '../modules/portfolio/models/WalletEvent';
import { streamMetrics, recordOutbound, recordInbound } from '../observability/streamMetrics';

const WS_PATH = '/ws';
const SUBSCRIBE_IDLE_MS = 5000;
const PORTFOLIO_HEARTBEAT_MS = 15000;

export interface PriceUpdateMessage {
  type: 'price';
  updates: Array<{ symbol: string; price: number; percentChange24h: number }>;
}

export interface SnapshotMessage {
  type: 'snapshot';
  prices: Record<string, { price: number; percentChange24h: number }>;
}

interface PortfolioEnvelope {
  channel: 'portfolio';
  seq: number;
  emittedAt: string;
}

export interface WalletEventMessage extends PortfolioEnvelope {
  type: 'wallet_event';
  event: IWalletEvent;
}

export interface WalletStatusMessage extends PortfolioEnvelope {
  type: 'wallet_status';
  update: {
    userId: string;
    address: string;
    chain: string;
    eventId: string;
    txHash: string;
    txStatus: 'success' | 'failed' | 'pending';
    explorerUrl?: string;
    updatedAt: string;
  };
}

export interface HoldingsDeltaMessage extends PortfolioEnvelope {
  type: 'holdings_delta';
  delta: {
    userId: string;
    addresses: string[];
    source: 'zerion_live' | 'api_snapshot';
    updatedAt: string;
    holdings: {
      totalValue: number;
      absoluteChange24h: number;
      relativeChange24h: number;
      positions: Array<{ name: string; symbol: string; quantity: number; value: number; chain: string }>;
    };
  };
}

interface PortfolioHeartbeatMessage extends PortfolioEnvelope {
  type: 'portfolio_heartbeat';
  healthy: true;
}

interface PortfolioSubscribedMessage extends PortfolioEnvelope {
  type: 'portfolio_subscribed';
  addresses: string[];
}

interface PortfolioSyncReadyMessage extends PortfolioEnvelope {
  type: 'portfolio_sync_ready';
  mode: 'live';
  addresses: string[];
}

type PortfolioOutboundMessage =
  | WalletEventMessage
  | WalletStatusMessage
  | HoldingsDeltaMessage
  | PortfolioHeartbeatMessage
  | PortfolioSubscribedMessage
  | PortfolioSyncReadyMessage;

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
let portfolioHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let portfolioSeq = 0;

function nextPortfolioEnvelope(): PortfolioEnvelope {
  portfolioSeq += 1;
  return {
    channel: 'portfolio',
    seq: portfolioSeq,
    emittedAt: new Date().toISOString(),
  };
}

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
  sendJson(ws, snap);
}

function sendJson(ws: WebSocket, message: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  const payload = JSON.stringify(message);
  recordOutbound(Buffer.byteLength(payload, 'utf8'));
  ws.send(payload);
}

function hasAddressIntersection(subscribed: Set<string>, targetAddresses: string[]): boolean {
  for (const address of targetAddresses) {
    if (subscribed.has(address)) return true;
  }
  return false;
}

function broadcastPortfolioMessage(message: PortfolioOutboundMessage, targetAddresses: string[]): void {
  if (!wssInstance) return;
  const payload = JSON.stringify(message);
  const bytes = Buffer.byteLength(payload, 'utf8');

  wssInstance.clients.forEach((client: WebSocket) => {
    if (client.readyState !== WebSocket.OPEN) return;
    const subscribed = clientAddresses.get(client);
    if (!subscribed || subscribed.size === 0) return;
    if (!hasAddressIntersection(subscribed, targetAddresses)) return;
    client.send(payload);
    recordOutbound(bytes);
  });
}

function broadcastPortfolioRealtime(message: PortfolioRealtimeMessage): void {
  if (message.type === 'wallet_event') {
    const outbound: WalletEventMessage = {
      ...nextPortfolioEnvelope(),
      type: 'wallet_event',
      event: message.event,
    };
    broadcastPortfolioMessage(outbound, [message.event.address.toLowerCase()]);
    return;
  }

  if (message.type === 'wallet_status') {
    const outbound: WalletStatusMessage = {
      ...nextPortfolioEnvelope(),
      type: 'wallet_status',
      update: message.update,
    };
    broadcastPortfolioMessage(outbound, [message.update.address.toLowerCase()]);
    return;
  }

  const outbound: HoldingsDeltaMessage = {
    ...nextPortfolioEnvelope(),
    type: 'holdings_delta',
    delta: message.delta,
  };
  broadcastPortfolioMessage(outbound, message.delta.addresses.map((a) => a.toLowerCase()));
}

function sendPortfolioLifecycleMessage(
  ws: WebSocket,
  type: 'portfolio_subscribed' | 'portfolio_sync_ready',
  addresses: string[]
): void {
  if (type === 'portfolio_subscribed') {
    const msg: PortfolioSubscribedMessage = {
      ...nextPortfolioEnvelope(),
      type,
      addresses,
    };
    sendJson(ws, msg);
    return;
  }

  const msg: PortfolioSyncReadyMessage = {
    ...nextPortfolioEnvelope(),
    type,
    mode: 'live',
    addresses,
  };
  sendJson(ws, msg);
}

function startPortfolioHeartbeat(): void {
  if (portfolioHeartbeatTimer || !wssInstance) return;

  portfolioHeartbeatTimer = setInterval(() => {
    if (!wssInstance) return;

    const heartbeatBase = nextPortfolioEnvelope();
    const heartbeat: PortfolioHeartbeatMessage = {
      ...heartbeatBase,
      type: 'portfolio_heartbeat',
      healthy: true,
    };
    const payload = JSON.stringify(heartbeat);
    const bytes = Buffer.byteLength(payload, 'utf8');

    wssInstance.clients.forEach((client: WebSocket) => {
      if (client.readyState !== WebSocket.OPEN) return;
      const addrs = clientAddresses.get(client);
      if (!addrs || addrs.size === 0) return;
      client.send(payload);
      recordOutbound(bytes);
    });
  }, PORTFOLIO_HEARTBEAT_MS);
}

/**
 * Push an aggregated wallet event to all clients subscribed to that address.
 * Kept for compatibility with existing call-sites.
 */
export function broadcastWalletEvent(event: IWalletEvent): void {
  broadcastPortfolioRealtime({ type: 'wallet_event', event });
}

export function attachWebSocketServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });
  wssInstance = wss;
  startRedisPriceSubscriber();
  startPortfolioHeartbeat();

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

  subscribeToPortfolioRealtime((message) => broadcastPortfolioRealtime(message));

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
          if (set.size > 0) {
            clearIdle();
            const subscribed = [...set.values()];
            sendPortfolioLifecycleMessage(ws, 'portfolio_subscribed', subscribed);
            sendPortfolioLifecycleMessage(ws, 'portfolio_sync_ready', subscribed);
          }
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
