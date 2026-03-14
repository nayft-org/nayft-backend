/**
 * Test holdings aggregator directly (no auth).
 * Run: npx ts-node scripts/test-holdings.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { fetchAndAggregateHoldings } from '../src/utils/holdingsAggregator';

const ADDRESS = '0x5b3F26d12A927b981Afeba1041A01F96993AA11F';

async function main() {
  console.log('Testing fetchAndAggregateHoldings for', ADDRESS);
  const result = await fetchAndAggregateHoldings([ADDRESS]);
  console.log('Result:', JSON.stringify(result, null, 2));
  console.log('Total value:', result.totalValue);
}

main().catch(console.error);
