#!/usr/bin/env ts-node
/** Synthetic: auth login endpoint returns non-5xx. */
const base = process.env.API_BASE_URL || 'http://localhost:3000/api';

async function main(): Promise<void> {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'synthetic@invalid.test', password: 'invalid' }),
  });
  if (res.status >= 500) {
    console.error('synth-auth-login failed:', res.status);
    process.exit(1);
  }
  console.log('synth-auth-login ok', res.status);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
