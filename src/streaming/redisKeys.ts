/** Redis keys and pub/sub channels for price streaming (API ↔ worker coordination). */

/** HASH: base symbol (e.g. BTC) → refcount (string integer) for client demand. */
export const STREAM_PRICE_SYMREF_KEY = 'stream:price:symref';

/** Pub/sub channel: batched normalized price updates `{ ts, updates }`. */
export const STREAM_PRICES_BATCH_CHANNEL = 'stream:prices:batch';
