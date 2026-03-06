import type { IExchangeStreamAdapter, NormalizedStreamEvent } from './types';
import { ingestKlineEvent } from './ingestors/klineIngester';
import { ingestAggTradeEvent } from './ingestors/aggTradeIngester';
import { streamConfig } from '../../config/streamConfig';

const adapters = new Map<string, IExchangeStreamAdapter>();

export function registerAdapter(exchangeId: string, adapter: IExchangeStreamAdapter): void {
  adapters.set(exchangeId.toLowerCase(), adapter);
}

export function getAdapter(exchangeId: string): IExchangeStreamAdapter | undefined {
  return adapters.get(exchangeId.toLowerCase());
}

function routeEvent(event: NormalizedStreamEvent): void {
  if (event.type === 'kline') {
    ingestKlineEvent(event);
  } else if (event.type === 'aggTrade') {
    ingestAggTradeEvent(event);
  }
}

export function startStreams(): void {
  const klineSymbols = streamConfig.kline.symbols;
  const aggTradeSymbols = streamConfig.aggTrade.symbols;
  const symbols = [...new Set([...klineSymbols, ...aggTradeSymbols])];
  const streamTypes: ('kline' | 'aggTrade')[] = ['kline', 'aggTrade'];
  const exchanges = streamConfig.exchanges;

  for (const exchangeId of exchanges) {
    const adapter = adapters.get(exchangeId);
    if (!adapter) continue;

    adapter.onMessage(routeEvent);
    adapter.subscribe(symbols, streamTypes);
    adapter.connect();
  }
}

export function stopStreams(): void {
  for (const adapter of adapters.values()) {
    adapter.disconnect();
  }
}
