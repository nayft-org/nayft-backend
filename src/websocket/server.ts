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
import { verifyAccessToken } from '../middlewares/jwtPayload';
import { incrementComplianceMetric } from '../observability/complianceMetrics';
import { WalletAddress } from '../modules/portfolio/models/WalletAddress';
import {
  registerNotifyClient,
  unregisterNotifyClient,
  startNotificationRedisFanout,
} from './notificationFanout';
import { registerNewsClient, startNewsRedisFanout, unregisterNewsClient } from './newsFanout';
import { attachRiskFanout, handleRiskWsMessage } from './riskFanout';
import {
  attachPortfolioFanout,
  markPortfolioFanoutClient,
  setPortfolioFanoutUserId,
} from './portfolioFanout';
import {
  allowWsV1QueryTokenSync,
  getWsRuntimeSwitches,
  recordWsProtocolVersion,
  rejectUnauthenticatedSubscription,
} from './authGate';
import { toWalletEventWsDto, type WalletEventWsDto } from './walletEventWsDto';
import {
  getOwnedAddressesCached,
  prefetchOwnedAddresses,
} from './walletOwnershipCache';

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
  event: WalletEventWsDto;
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

/** Pending notify userId parsed from WS URL query `token` before `connection` fires */
const pendingNotifyUserId = new WeakMap<WebSocket, string>();
/** Bound notify userId for cleanup */
const wsNotifyUserId = new WeakMap<WebSocket, string>();
/** Whether this ws subscribed to live news insert events. */
const wsNewsSubscribed = new WeakMap<WebSocket, boolean>();

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
      event: toWalletEventWsDto(message.event),
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
  startNotificationRedisFanout();
  startNewsRedisFanout();
  attachRiskFanout(wss);
  attachPortfolioFanout(wss);

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = request.url?.split('?')[0];
    if (pathname === WS_PATH) {
      const v1Allowed = allowWsV1QueryTokenSync();
      wss.handleUpgrade(request, socket, head, (ws) => {
        if (v1Allowed) {
          try {
            const host = request.headers.host || 'localhost';
            const u = new URL(request.url || '/', `http://${host}`);
            const tok = u.searchParams.get('token');
            const dec = verifyAccessToken(tok);
            if (dec?.userId) {
              pendingNotifyUserId.set(ws, dec.userId);
              recordWsProtocolVersion(1);
            }
          } catch {
            /* ignore */
          }
        }
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
      const hasNotify = !!wsNotifyUserId.get(ws);
      const hasNews = !!wsNewsSubscribed.get(ws);
      if (!hasPrice && !hasPortfolio && !hasNotify && !hasNews) {
        ws.close(4408, 'subscription required');
      }
    }, SUBSCRIBE_IDLE_MS);

    const clearIdle = (): void => {
      clearTimeout(idleTimer);
    };

    const bindNotifyUser = (userId: string, protocol: 1 | 2 = 2): void => {
      const prev = wsNotifyUserId.get(ws);
      if (prev && prev !== userId) {
        unregisterNotifyClient(ws, prev);
      }
      wsNotifyUserId.set(ws, userId);
      setPortfolioFanoutUserId(ws, userId);
      registerNotifyClient(ws, userId);
      recordWsProtocolVersion(protocol);
      clearIdle();
      sendJson(ws, {
        channel: 'notifications',
        v: '1.0',
        type: 'notification_subscribed',
        userId,
      });
      void prefetchOwnedAddresses(userId, async () => {
        const rows = await WalletAddress.find({ userId }).select('address').lean();
        return rows.map((w) => String(w.address));
      }).catch(() => {});
    };

    const pending = pendingNotifyUserId.get(ws);
    if (pending) {
      bindNotifyUser(pending, 1);
      pendingNotifyUserId.delete(ws);
    }

    void getWsRuntimeSwitches().then((switches) => {
      if (!switches.ws_protocol_v2_required) return;
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (!wsNotifyUserId.get(ws)) {
          rejectUnauthenticatedSubscription(ws, 'ws_auth required');
        }
      }, 5000);
    }).catch(() => {});

    ws.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;

        if (msg.type === 'ws_auth') {
          const token = typeof msg.token === 'string' ? msg.token : undefined;
          const dec = verifyAccessToken(token);
          if (dec?.userId) {
            bindNotifyUser(dec.userId, 2);
          } else {
            incrementComplianceMetric('wsAuthFailuresTotal');
          }
        }

        if (msg.type === 'notification_subscribe') {
          const token =
            typeof msg.token === 'string'
              ? msg.token
              : typeof msg.body === 'object' &&
                  msg.body !== null &&
                  typeof (msg.body as Record<string, unknown>).token === 'string'
                ? String((msg.body as Record<string, unknown>).token)
                : undefined;
          const dec = verifyAccessToken(token);
          if (dec?.userId) {
            bindNotifyUser(dec.userId, 2);
          } else if (!wsNotifyUserId.get(ws)) {
            rejectUnauthenticatedSubscription(ws, 'authentication required');
          }
        }

        if (msg.type === 'subscribe' && Array.isArray(msg.symbols)) {
          const list = msg.symbols.filter((s): s is string => typeof s === 'string' && s.length > 0);
          replaceClientSymbols(ws, list);
          if (list.length > 0) {
            clearIdle();
            sendFilteredSnapshot(ws);
          }
        }

        if (msg.type === 'portfolio_subscribe' && Array.isArray(msg.addresses)) {
          const userId = wsNotifyUserId.get(ws);
          if (!userId) {
            rejectUnauthenticatedSubscription(ws, 'portfolio requires ws_auth');
            return;
          }

          const set = getClientAddresses(ws);
          set.clear();
          const requested = msg.addresses
            .filter((a): a is string => typeof a === 'string' && a.length > 0)
            .map((a) => a.toLowerCase());

          const applySubscription = (ownedSet: Set<string>): void => {
            const allowed = requested.filter((a) => ownedSet.has(a));
            if (allowed.length < requested.length) {
              incrementComplianceMetric('portfolioSubscribeAuthzDeniedTotal');
            }
            for (const a of allowed) set.add(a);
            if (set.size > 0) {
              clearIdle();
              markPortfolioFanoutClient(ws as WebSocket & { portfolioFanoutSubscribed?: boolean });
              const subscribed = [...set.values()];
              sendPortfolioLifecycleMessage(ws, 'portfolio_subscribed', subscribed);
              sendPortfolioLifecycleMessage(ws, 'portfolio_sync_ready', subscribed);
            }
          };

          const cached = getOwnedAddressesCached(userId);
          if (cached) {
            applySubscription(cached);
            return;
          }

          void (async () => {
            const ownedSet = await prefetchOwnedAddresses(userId, async () => {
              const owned = await WalletAddress.find({ userId }).select('address').lean();
              return owned.map((w) => String(w.address));
            });
            applySubscription(ownedSet);
          })();
        }

        if (msg.type === 'portfolio_unsubscribe') {
          const set = clientAddresses.get(ws);
          if (set) set.clear();
        }

        if (msg.type === 'news_subscribe') {
          wsNewsSubscribed.set(ws, true);
          registerNewsClient(ws);
          clearIdle();
          sendJson(ws, {
            channel: 'news',
            v: '1.0',
            type: 'news_subscribed',
          });
        }

        if (handleRiskWsMessage(ws as WebSocket & { riskSubscribed?: boolean }, msg as { type?: string })) {
          clearIdle();
        }
      } catch {
        /* ignore malformed */
      }
    });

    ws.on('close', () => {
      streamMetrics.connectedWsClients -= 1;
      const nUid = wsNotifyUserId.get(ws);
      if (nUid) {
        unregisterNotifyClient(ws, nUid);
        wsNotifyUserId.delete(ws);
      }
      if (wsNewsSubscribed.get(ws)) {
        unregisterNewsClient(ws);
        wsNewsSubscribed.delete(ws);
      }
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
