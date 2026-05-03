import { coindcxService } from '../../integrations/coindcx/coindcxService';
import { portfolioRepository } from './repository';
import { decryptExchangeCredentials } from './exchangeCrypto';
import { getUsdPriceForSymbol } from './exchangePriceOracle';
import { HoldingPositionFields } from './models/Holding';
import { PORTFOLIO_SCHEMA_VERSION } from './schemaVersion';

const CHAIN = 'coindcx';
const VENUE = 'coindcx';

const POLLABLE = new Set<string>(['active', 'rate_limited']);

/**
 * Live CoinDCX balances → USD positions (per `ExchangeConnection` row).
 * Skips connections that are not active-like or cannot be decrypted.
 */
export async function fetchCoindcxHoldingsForUser(userId: string): Promise<HoldingPositionFields[]> {
  const conns = await portfolioRepository.findExchangeConnectionsByUser(userId);
  const out: HoldingPositionFields[] = [];

  for (const conn of conns) {
    if (!POLLABLE.has(conn.status)) continue;
    const connectionId = String(conn._id);

    let creds: { apiKey: string; apiSecret: string };
    try {
      creds = decryptExchangeCredentials({
        encryptionKeyId: conn.encryptionKeyId,
        ciphertext: conn.encryptedSecretBlob,
      });
    } catch {
      continue;
    }

    let balances: Awaited<ReturnType<typeof coindcxService.getBalances>>;
    try {
      balances = await coindcxService.getBalances(creds);
    } catch (e) {
      console.warn('[ExchangeHoldings] getBalances failed', { connectionId, err: (e as Error).message });
      continue;
    }

    for (const b of balances) {
      const qty = b.free + b.locked;
      if (qty <= 0 || !b.asset) continue;
      const px = await getUsdPriceForSymbol(b.asset);
      if (px == null) continue;
      const value = qty * px;
      if (value <= 0) continue;
      out.push({
        name: b.asset,
        symbol: b.asset,
        quantity: qty,
        value:    Math.round(value * 1e6) / 1e6,
        chain:    CHAIN,
        source:  'exchange',
        venue:   VENUE,
        sourceConnectionId: connectionId,
        schemaVersion: PORTFOLIO_SCHEMA_VERSION,
      });
    }
  }

  return out;
}
