#!/usr/bin/env ts-node
/** Synthetic: WS connect + ws_auth message (no portfolio subscribe). */
import WebSocket from 'ws';

const wsUrl = process.env.WS_URL || 'ws://localhost:3000/ws';
const token = process.env.SYNTH_WS_TOKEN;

async function main(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('ws timeout'));
    }, 8000);

    ws.on('open', () => {
      if (token) {
        ws.send(JSON.stringify({ type: 'ws_auth', token, protocol: 2 }));
      }
      clearTimeout(timer);
      ws.close();
      resolve();
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  console.log('synth-ws-v2 ok');
}

main().catch((e) => {
  console.error('synth-ws-v2 failed', e);
  process.exit(1);
});
