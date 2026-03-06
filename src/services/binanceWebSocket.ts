import WebSocket from 'ws';

const BINANCE_WS_URL = 'wss://stream.binance.com:9443/stream?streams=!ticker@arr';

export interface PriceUpdate {
  symbol: string;
  price: number;
  percentChange24h: number;
}

type PriceUpdateCallback = (updates: PriceUpdate[]) => void;

const priceCache = new Map<string, { price: number; percentChange24h: number }>();
const subscribers = new Set<PriceUpdateCallback>();

function deriveBaseSymbol(binanceSymbol: string): string {
  if (binanceSymbol.endsWith('USDT')) {
    return binanceSymbol.slice(0, -4);
  }
  return binanceSymbol;
}

function processTickerMessage(data: unknown): PriceUpdate[] {
  const updates: PriceUpdate[] = [];
  let tickers: Array<{ s?: string; c?: string; P?: string }> = [];

  if (Array.isArray(data)) {
    tickers = data;
  } else if (data && typeof data === 'object' && 'stream' in data && 'data' in data) {
    const payload = (data as { data: unknown }).data;
    if (Array.isArray(payload)) {
      tickers = payload;
    } else if (payload && typeof payload === 'object' && 's' in payload) {
      tickers = [payload as { s?: string; c?: string; P?: string }];
    }
  }

  for (const t of tickers) {
    const s = t.s;
    const c = t.c;
    const P = t.P;
    if (!s || c === undefined || P === undefined) continue;

    const price = parseFloat(c);
    const percentChange24h = parseFloat(P);
    if (Number.isNaN(price) || Number.isNaN(percentChange24h)) continue;

    const symbol = deriveBaseSymbol(s);
    priceCache.set(symbol, { price, percentChange24h });
    updates.push({ symbol, price, percentChange24h });
  }

  return updates;
}

function broadcast(updates: PriceUpdate[]): void {
  if (updates.length === 0) return;
  for (const cb of subscribers) {
    try {
      cb(updates);
    } catch (err) {
      console.error('Binance WS subscriber error:', err);
    }
  }
}

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 60000;

function connect(): void {
  ws = new WebSocket(BINANCE_WS_URL);

  ws.on('open', () => {
    console.log('[Binance WS] Connected');
    reconnectAttempts = 0;
  });

  ws.on('message', (raw: Buffer | string) => {
    try {
      const data = JSON.parse(raw.toString());
      const updates = processTickerMessage(data);
      broadcast(updates);
    } catch (err) {
      console.error('[Binance WS] Parse error:', err);
    }
  });

  ws.on('ping', () => {
    ws?.pong();
  });

  ws.on('close', () => {
    console.log('[Binance WS] Disconnected');
    ws = null;
    const delay = Math.min(1000 * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY);
    reconnectAttempts++;
    setTimeout(connect, delay);
  });

  ws.on('error', (err: Error) => {
    console.error('[Binance WS] Error:', err.message);
  });
}

export const binanceWebSocket = {
  start(): void {
    if (ws?.readyState === WebSocket.OPEN) return;
    connect();
  },

  stop(): void {
    if (ws) {
      ws.close();
      ws = null;
    }
  },

  getPriceCache(): Map<string, { price: number; percentChange24h: number }> {
    return new Map(priceCache);
  },

  subscribe(callback: PriceUpdateCallback): () => void {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  },
};
