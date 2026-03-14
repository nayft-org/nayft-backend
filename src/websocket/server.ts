import { Server as HttpServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { binanceWebSocket } from '../services/binanceWebSocket';
import { subscribeToWalletEvents } from '../services/walletEventAggregator';
import { IWalletEvent } from '../modules/portfolio/models/WalletEvent';

const WS_PATH = '/ws';

export interface PriceUpdateMessage {
  type: 'price';
  updates: Array<{ symbol: string; price: number; percentChange24h: number }>;
}

export interface SnapshotMessage {
  type: 'snapshot';
  prices: Record<string, { price: number; percentChange24h: number }>;
}

export interface WalletEventMessage {
  type:  'wallet_event';
  event: IWalletEvent;
}

/** Per-client symbol subscription for viewport-aware price updates */
const clientSymbols = new WeakMap<WebSocket, Set<string>>();

/** Per-client portfolio address subscription */
const clientAddresses = new WeakMap<WebSocket, Set<string>>();

// Module-level wss reference so broadcastWalletEvent can access it
let wssInstance: WebSocketServer | null = null;

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

/**
 * Push an aggregated wallet event to all clients subscribed to that address.
 * Called by walletEventAggregator after each flush.
 */
export function broadcastWalletEvent(event: IWalletEvent): void {
  if (!wssInstance) return;
  const msg: WalletEventMessage = { type: 'wallet_event', event };
  const payload = JSON.stringify(msg);

  wssInstance.clients.forEach((client: WebSocket) => {
    if (client.readyState !== WebSocket.OPEN) return;
    const addrs = clientAddresses.get(client);
    if (addrs && addrs.has(event.address.toLowerCase())) {
      client.send(payload);
    }
  });
}

export function attachWebSocketServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });
  wssInstance = wss;

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

  // Forward Binance price ticks to subscribed clients
  binanceWebSocket.subscribe((updates) => {
    wss.clients.forEach((client: WebSocket) => {
      if (client.readyState !== WebSocket.OPEN) return;
      const symbols = getClientSymbols(client);
      const filtered =
        symbols.size > 0 ? updates.filter((u) => symbols.has(u.symbol)) : updates;
      if (filtered.length > 0) {
        const msg: PriceUpdateMessage = { type: 'price', updates: filtered };
        client.send(JSON.stringify(msg));
      }
    });
  });

  // Forward aggregated wallet events to subscribed clients
  subscribeToWalletEvents((event) => broadcastWalletEvent(event));

  wss.on('connection', (ws: WebSocket) => {
    const cache = binanceWebSocket.getPriceCache();
    const snapshot: SnapshotMessage = {
      type: 'snapshot',
      prices: Object.fromEntries(cache),
    };
    ws.send(JSON.stringify(snapshot));

    ws.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'subscribe' && Array.isArray(msg.symbols)) {
          const set = getClientSymbols(ws);
          set.clear();
          for (const s of msg.symbols) {
            if (typeof s === 'string' && s) set.add(s.toUpperCase());
          }
        }

        if (msg.type === 'portfolio_subscribe' && Array.isArray(msg.addresses)) {
          const set = getClientAddresses(ws);
          set.clear();
          for (const a of msg.addresses) {
            if (typeof a === 'string' && a) set.add(a.toLowerCase());
          }
        }

        if (msg.type === 'portfolio_unsubscribe') {
          const set = clientAddresses.get(ws);
          if (set) set.clear();
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('close', () => {
      clientSymbols.delete(ws);
      clientAddresses.delete(ws);
    });
  });
}
