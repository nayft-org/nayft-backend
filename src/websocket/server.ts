import { Server as HttpServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { binanceWebSocket } from '../services/binanceWebSocket';

const WS_PATH = '/ws';

export interface PriceUpdateMessage {
  type: 'price';
  updates: Array<{ symbol: string; price: number; percentChange24h: number }>;
}

export interface SnapshotMessage {
  type: 'snapshot';
  prices: Record<string, { price: number; percentChange24h: number }>;
}

/** Per-client symbol subscription for viewport-aware price updates */
const clientSymbols = new WeakMap<WebSocket, Set<string>>();

function getClientSymbols(ws: WebSocket): Set<string> {
  let set = clientSymbols.get(ws);
  if (!set) {
    set = new Set();
    clientSymbols.set(ws, set);
  }
  return set;
}

export function attachWebSocketServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

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
      } catch {
        // ignore invalid messages
      }
    });

    ws.on('close', () => {
      clientSymbols.delete(ws);
    });
  });
}
