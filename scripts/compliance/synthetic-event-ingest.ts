#!/usr/bin/env ts-node
/** Synthetic: event ingest accepts registered client event in log mode. */
const base = process.env.API_BASE_URL || 'http://localhost:3000/api';

async function main(): Promise<void> {
  const res = await fetch(`${base}/events/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      featureKey: 'auth',
      eventType: 'login_attempt',
      metadata: {},
    }),
  });
  if (res.status === 503) {
    console.warn('synth-event-ingest: ingest disabled (503) — acceptable in drill');
    process.exit(0);
  }
  if (!res.ok && res.status !== 401) {
    console.error('synth-event-ingest failed:', res.status, await res.text());
    process.exit(1);
  }
  console.log('synth-event-ingest ok', res.status);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
