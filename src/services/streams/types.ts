export type KlineInterval = '1m' | '5m' | '1h' | '1d';

export interface NormalizedKlineEvent {
  type: 'kline';
  exchange: string;
  symbol: string;
  interval: KlineInterval;
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number;
  tradeCount?: number;
  closed: boolean;
}

export interface NormalizedTradeEvent {
  type: 'trade' | 'aggTrade';
  exchange: string;
  symbol: string;
  price: number;
  quantity: number;
  quoteQuantity?: number;
  time: number;
  tradeId: number | string;
  isBuyerMaker?: boolean;
}

export type NormalizedStreamEvent = NormalizedKlineEvent | NormalizedTradeEvent;

export type StreamEventCallback = (event: NormalizedStreamEvent) => void;

export interface IExchangeStreamAdapter {
  connect(): void;
  disconnect(): void;
  subscribe(symbols: string[], streamTypes: ('kline' | 'trade' | 'aggTrade')[]): void;
  onMessage(callback: StreamEventCallback): () => void;
  isConnected(): boolean;
}
