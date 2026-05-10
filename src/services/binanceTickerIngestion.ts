import WebSocket from 'ws';
import { redis } from '../config/redis';
import { streamConfig } from '../config/streamConfig';
import { STREAM_PRICES_BATCH_CHANNEL, STREAM_PRICE_SYMREF_KEY } from '../streaming/redisKeys';
import { recordInbound, recordRedisPublish } from '../observability/streamMetrics';

const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/stream';
/** Binance allows many streams per connection; stay conservative for URL length and parsing load. */
const MAX_STREAMS_PER_CONNECTION = 200;
const RECONNECT_DEBOUNCE_MS = 450;
const REDIS_SYM_POLL_MS = 500;
/** Coalesce publishes to Redis to protect Redis and downstream API CPU. */
const REDIS_PUBLISH_FLUSH_MS = 120;

export interface PriceUpdate {
  symbol: string;
  price: number;
  percentChange24h: number;
}

function toBinanceStreamSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  return s.endsWith('USDT') ? s.toLowerCase() : `${s}USDT`.toLowerCase();
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function deriveBaseSymbol(binanceSymbol: string): string {
  if (binanceSymbol.endsWith('USDT')) {
    return binanceSymbol.slice(0, -4);
  }
  return binanceSymbol;
}

/**
 * Parse a single Binance 24h ticker payload (combined stream wraps { stream, data }).
 */
function processTickerPayload(data: unknown): PriceUpdate | null {
  if (!data || typeof data !== 'object') return null;
  const t = data as { s?: string; c?: string; P?: string };
  const s = t.s;
  const c = t.c;
  const P = t.P;
  if (!s || c === undefined || P === undefined) return null;
  const price = parseFloat(c);
  const percentChange24h = parseFloat(P);
  if (Number.isNaN(price) || Number.isNaN(percentChange24h)) return null;
  return {
    symbol: deriveBaseSymbol(s),
    price,
    percentChange24h,
  };
}

/** Only retain entries for symbols we are actively subscribed to (prevents unbounded growth). */
function prunePriceCache(
  cache: Map<string, { price: number; percentChange24h: number }>,
  active: Set<string>
): void {
  for (const key of cache.keys()) {
    if (!active.has(key)) cache.delete(key);
  }
}

export function startBinanceTickerIngestion(): () => void {
  const priceCache = new Map<string, { price: number; percentChange24h: number }>();
  const pendingPublish = new Map<string, PriceUpdate>();
  let publishTimer: ReturnType<typeof setTimeout> | null = null;
  const sockets: WebSocket[] = [];
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSymbolKey = '';
  /** Last symbol set used for Binance connections (reconnect on socket drop). */
  let lastConnectedSymbols: string[] = [];
  let stopped = false;

  function schedulePublish(): void {
    if (publishTimer) return;
    publishTimer = setTimeout(() => {
      publishTimer = null;
      if (pendingPublish.size === 0) return;
      const updates = [...pendingPublish.values()];
      pendingPublish.clear();
      const json = JSON.stringify({ ts: Date.now(), updates });
      redis
        .publish(STREAM_PRICES_BATCH_CHANNEL, json)
        .then(() => {
          recordRedisPublish();
        })
        .catch((err) => {
          console.error('[BinanceTicker] Redis publish error:', err);
        });
    }, REDIS_PUBLISH_FLUSH_MS);
  }

  function onRawMessage(raw: Buffer | string): void {
    const buf = typeof raw === 'string' ? Buffer.from(raw) : raw;
    recordInbound(buf.length);
    try {
      const data = JSON.parse(buf.toString()) as unknown;
      let payload: unknown = data;
      if (data && typeof data === 'object' && 'data' in data) {
        payload = (data as { data: unknown }).data;
      }
      const update = processTickerPayload(payload);
      if (!update) return;
      priceCache.set(update.symbol, {
        price: update.price,
        percentChange24h: update.percentChange24h,
      });
      pendingPublish.set(update.symbol, update);
      schedulePublish();
    } catch (err) {
      console.error('[BinanceTicker] Parse error:', err);
    }
  }

  let reconnectAttempts = 0;
  const MAX_RECONNECT_DELAY = 60000;
  let fatalCloseDebounce: ReturnType<typeof setTimeout> | null = null;

  /**
   * Tear down a socket without triggering ws's "closed before established" throw when the
   * handshake is still in progress (common when symbol set changes and we reconnect quickly).
   */
  function destroySocket(s: WebSocket): void {
    try {
      s.removeAllListeners();
      if (s.readyState === WebSocket.CONNECTING) {
        s.terminate();
      } else if (s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CLOSING) {
        s.close();
      }
    } catch {
      try {
        s.terminate();
      } catch {
        /* ignore */
      }
    }
  }

  function disconnectAll(): void {
    for (const s of sockets) {
      destroySocket(s);
    }
    sockets.length = 0;
    if (fatalCloseDebounce) {
      clearTimeout(fatalCloseDebounce);
      fatalCloseDebounce = null;
    }
  }

  function scheduleFatalReconnect(): void {
    if (stopped) return;
    if (fatalCloseDebounce) clearTimeout(fatalCloseDebounce);
    fatalCloseDebounce = setTimeout(() => {
      fatalCloseDebounce = null;
      const delay = Math.min(1000 * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY);
      reconnectAttempts++;
      setTimeout(() => {
        if (!stopped) connectWithSymbols(lastConnectedSymbols);
      }, delay);
    }, 400);
  }

  function connectWithSymbols(symbolsUpper: string[]): void {
    disconnectAll();
    const list = symbolsUpper.map((s) => s.trim().toUpperCase()).filter(Boolean);
    lastConnectedSymbols = list;
    const active = new Set(list);
    prunePriceCache(priceCache, active);

    if (active.size === 0) {
      console.log('[BinanceTicker] No symbols to subscribe; idle');
      return;
    }

    const streams = [...active].map((s) => `${toBinanceStreamSymbol(s)}@ticker`);
    const groups = chunk(streams, MAX_STREAMS_PER_CONNECTION);

    for (const group of groups) {
      const url = `${BINANCE_WS_BASE}?streams=${group.join('/')}`;
      const ws = new WebSocket(url);
      sockets.push(ws);
      ws.on('open', () => {
        console.log('[BinanceTicker] Connected', url.slice(0, 120) + (url.length > 120 ? '…' : ''));
        reconnectAttempts = 0;
      });
      ws.on('message', onRawMessage);
      ws.on('ping', () => {
        ws.pong();
      });
      ws.on('close', () => {
        console.log('[BinanceTicker] Socket closed');
        scheduleFatalReconnect();
      });
      ws.on('error', (err: Error) => {
        console.error('[BinanceTicker] Socket error:', err.message);
      });
    }
  }

  function scheduleReconnect(symbols: string[]): void {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectWithSymbols(symbols);
    }, RECONNECT_DEBOUNCE_MS);
  }

  async function loadDesiredSymbols(): Promise<string[]> {
    const baseline = streamConfig.ticker.baselineSymbols;
    try {
      const hash = await redis.hgetall(STREAM_PRICE_SYMREF_KEY);
      const fromClients: string[] = [];
      for (const [sym, countStr] of Object.entries(hash)) {
        const n = parseInt(countStr, 10);
        if (Number.isFinite(n) && n > 0) fromClients.push(sym.toUpperCase());
      }
      return [...new Set([...baseline, ...fromClients])];
    } catch (err) {
      console.error('[BinanceTicker] Redis symref read failed; using baseline only:', err);
      return [...baseline];
    }
  }

  async function pollSymbols(): Promise<void> {
    if (stopped) return;
    const merged = await loadDesiredSymbols();
    const key = [...merged].sort().join('|');
    if (key !== lastSymbolKey) {
      lastSymbolKey = key;
      scheduleReconnect(merged);
    }
  }

  void pollSymbols();
  pollTimer = setInterval(() => {
    void pollSymbols();
  }, REDIS_SYM_POLL_MS);

  return () => {
    stopped = true;
    if (pollTimer) clearInterval(pollTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (publishTimer) clearTimeout(publishTimer);
    if (pendingPublish.size > 0) {
      const updates = [...pendingPublish.values()];
      pendingPublish.clear();
      void redis
        .publish(STREAM_PRICES_BATCH_CHANNEL, JSON.stringify({ ts: Date.now(), updates }))
        .then(() => {
          recordRedisPublish();
        })
        .catch((err) => console.error('[BinanceTicker] Final publish error:', err));
    }
    disconnectAll();
  };
}
