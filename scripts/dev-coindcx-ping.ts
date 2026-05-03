/**
 * Smoke-test CoinDCX credentials against the live API (balances + one trade_history page).
 * Usage:
 *   COINDCX_API_KEY=... COINDCX_API_SECRET=... npx ts-node --transpile-only scripts/dev-coindcx-ping.ts
 * Or load from .env in crypto-backend root.
 */
import dotenv from 'dotenv';

dotenv.config();

async function main(): Promise<void> {
  const apiKey = process.env.COINDCX_API_KEY?.trim();
  const apiSecret = process.env.COINDCX_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    console.error('Set COINDCX_API_KEY and COINDCX_API_SECRET (e.g. in .env).');
    process.exit(1);
  }

  const { coindcxService } = await import('../src/integrations/coindcx/coindcxService');

  console.log('Validating credentials (users/info)...');
  await coindcxService.validateCredentials({ apiKey, apiSecret });
  console.log('OK — users/info succeeded.');

  console.log('Fetching balances...');
  const balances = await coindcxService.getBalances({ apiKey, apiSecret });
  console.log(`OK — ${balances.length} balance row(s). Sample:`, balances.slice(0, 3));

  console.log('Fetching one page of trade history (desc)...');
  const trades = await coindcxService.getTradeHistoryPage(
    { apiKey, apiSecret },
    { sort: 'desc', limit: 5 }
  );
  console.log(`OK — ${trades.length} trade(s) in page.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
