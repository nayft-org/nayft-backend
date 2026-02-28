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
    const msg: PriceUpdateMessage = { type: 'price', updates };
    const payload = JSON.stringify(msg);
    wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
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
  });
}
