import WebSocket from 'ws';
import type {
  IExchangeStreamAdapter,
  NormalizedKlineEvent,
  NormalizedTradeEvent,
  NormalizedStreamEvent,
  StreamEventCallback,
} from '../types';
import { streamConfig } from '../../../config/streamConfig';

const BINANCE_WS_BASE = 'wss://stream.binance.com:9443';

function toBinanceSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  return s.endsWith('USDT') ? s.toLowerCase() : `${s}USDT`.toLowerCase();
}

function parseKlinePayload(data: unknown): NormalizedKlineEvent | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const k = obj.k as Record<string, unknown> | undefined;
  if (!k || typeof k !== 'object') return null;

  const t = typeof k.t === 'number' ? k.t : parseInt(String(k.t), 10);
  const o = parseFloat(String(k.o ?? 0));
  const h = parseFloat(String(k.h ?? 0));
  const l = parseFloat(String(k.l ?? 0));
  const c = parseFloat(String(k.c ?? 0));
  const v = parseFloat(String(k.v ?? 0));
  const q = parseFloat(String(k.q ?? 0));
  const n = typeof k.n === 'number' ? k.n : parseInt(String(k.n ?? 0), 10);
  const x = Boolean(k.x);

  const s = String(k.s ?? obj.s ?? '');
  if (!s) return null;

  const baseSymbol = s.endsWith('USDT') ? s.slice(0, -4) : s;

  return {
    type: 'kline',
    exchange: 'binance',
    symbol: baseSymbol,
    interval: '1m',
    openTime: t,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: v,
    quoteVolume: q || undefined,
    tradeCount: n || undefined,
    closed: x,
  };
}

function parseAggTradePayload(data: unknown): NormalizedTradeEvent | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  if (String(obj.e) !== 'aggTrade') return null;

  const s = String(obj.s ?? '');
  if (!s) return null;
  const baseSymbol = s.endsWith('USDT') ? s.slice(0, -4) : s;

  const p = parseFloat(String(obj.p ?? 0));
  const q = parseFloat(String(obj.q ?? 0));
  const T = typeof obj.T === 'number' ? obj.T : parseInt(String(obj.T ?? 0), 10);

  return {
    type: 'aggTrade',
    exchange: 'binance',
    symbol: baseSymbol,
    price: p,
    quantity: q,
    quoteQuantity: p * q,
    time: T,
    tradeId: (obj.a ?? obj.f ?? '') as number | string,
    isBuyerMaker: Boolean(obj.m),
  };
}

export class BinanceKlineAdapter implements IExchangeStreamAdapter {
  private ws: WebSocket | null = null;
  private subscribers = new Set<StreamEventCallback>();
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 60000;
  private subscribedSymbols: string[] = [];
  private subscribedStreamTypes: ('kline' | 'trade' | 'aggTrade')[] = [];

  private buildStreams(): string[] {
    const symbols = this.subscribedSymbols.length > 0
      ? this.subscribedSymbols
      : streamConfig.kline.symbols;
    const types = this.subscribedStreamTypes.length > 0
      ? this.subscribedStreamTypes
      : ['kline'];
    const streams: string[] = [];
    for (const sym of symbols) {
      const binanceSym = toBinanceSymbol(sym);
      if (types.includes('kline')) streams.push(`${binanceSym}@kline_1m`);
      if (types.includes('aggTrade')) streams.push(`${binanceSym}@aggTrade`);
    }
    return streams;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const streams = this.buildStreams();
    if (streams.length === 0) return;

    const url = `${BINANCE_WS_BASE}/stream?streams=${streams.join('/')}`;

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('[BinanceStreamAdapter] Connected');
      this.reconnectAttempts = 0;
    });

    this.ws.on('message', (raw: Buffer | string) => {
      try {
        const data = JSON.parse(raw.toString());
        const payload = data.data ?? data;
        const stream = data.stream as string | undefined;

        let event: NormalizedStreamEvent | null = null;
        if (stream?.includes('kline')) {
          event = parseKlinePayload(payload);
        } else if (stream?.includes('aggTrade')) {
          event = parseAggTradePayload(payload);
        }

        if (event) {
          for (const cb of this.subscribers) {
            try {
              cb(event);
            } catch (err) {
              console.error('[BinanceStreamAdapter] Subscriber error:', err);
            }
          }
        }
      } catch (err) {
        console.error('[BinanceStreamAdapter] Parse error:', err);
      }
    });

    this.ws.on('ping', () => {
      this.ws?.pong();
    });

    this.ws.on('close', () => {
      console.log('[BinanceStreamAdapter] Disconnected');
      this.ws = null;
      const delay = Math.min(1000 * 2 ** this.reconnectAttempts, this.maxReconnectDelay);
      this.reconnectAttempts++;
      setTimeout(() => this.connect(), delay);
    });

    this.ws.on('error', (err: Error) => {
      console.error('[BinanceStreamAdapter] Error:', err.message);
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  subscribe(symbols: string[], streamTypes: ('kline' | 'trade' | 'aggTrade')[]): void {
    this.subscribedSymbols = symbols;
    this.subscribedStreamTypes = streamTypes;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.disconnect();
      this.connect();
    }
  }

  onMessage(callback: StreamEventCallback): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
