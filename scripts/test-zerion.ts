/**
 * Quick script to test Zerion API response for a wallet.
 * Run: npx ts-node scripts/test-zerion.ts
 */
import dotenv from 'dotenv';
dotenv.config();

const ADDRESS = '0x5b3F26d12A927b981Afeba1041A01F96993AA11F';
const ZERION_BASE = process.env.ZERION_BASE_URL || 'https://api.zerion.io/v1';
const ZERION_KEY = process.env.ZERION_API_KEY || '';

async function main() {
  if (!ZERION_KEY) {
    console.error('ZERION_API_KEY required');
    process.exit(1);
  }
  const auth = Buffer.from(`${ZERION_KEY}:`).toString('base64');

  console.log('=== Portfolio ===');
  const portRes = await fetch(`${ZERION_BASE}/wallets/${ADDRESS}/portfolio`, {
    headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
  });
  const portJson = await portRes.json();
  console.log('Status:', portRes.status);
  console.log(JSON.stringify(portJson, null, 2));

  console.log('\nWaiting 2s before positions (avoid 429)...');
  await new Promise((r) => setTimeout(r, 2000));

  console.log('\n=== Positions ===');
  const posRes = await fetch(`${ZERION_BASE}/wallets/${ADDRESS}/positions/?sort=value&currency=usd`, {
    headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
  });
  const posJson = (await posRes.json()) as any;
  console.log('Status:', posRes.status);
  const posData = Array.isArray(posJson?.data) ? posJson.data : posJson?.data?.data ?? [];
  if (posData.length) {
    console.log('First 3 positions:', JSON.stringify(posData.slice(0, 3), null, 2));
    const totalFromPos = posData.reduce((s: number, p: any) => s + (p.attributes?.value ?? 0), 0);
    console.log('Total from positions:', totalFromPos);
  } else {
    console.log(JSON.stringify(posJson, null, 2));
  }
}

main().catch(console.error);
