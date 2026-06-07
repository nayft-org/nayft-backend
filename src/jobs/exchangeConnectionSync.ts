import { config } from '../config/env';
import { coindcxService } from '../integrations/coindcx/coindcxService';
import { CoindcxApiError } from '../integrations/coindcx/coindcxErrors';
import { portfolioRepository } from '../modules/portfolio/repository';
import { decryptExchangeCredentials } from '../modules/portfolio/exchangeCrypto';
import { IExchangeConnection } from '../modules/portfolio/models/ExchangeConnection';
import { normalizeCoindcxTradeRow } from '../modules/portfolio/coindcxTradeNormalizer';
import { PORTFOLIO_SCHEMA_VERSION } from '../modules/portfolio/schemaVersion';
import { normalizeEnrichedData } from '../modules/portfolio/normalizers/walletEventNormalizer';
import { publishWalletEventToSubscribers } from '../services/walletEventAggregator';

const CHAIN = 'coindcx';
const VENUE = 'coindcx';

function connectionIdString(conn: IExchangeConnection): string {
  const id = conn._id;
  return typeof id === 'string' ? id : (id as { toString(): string }).toString();
}

function syntheticAddress(connectionId: string): string {
  return `coindcx:${connectionId}`.toLowerCase();
}

function computeNextPollMs(conn: IExchangeConnection): number {
  const base = conn.pollingIntervalMs || config.exchangeLivePollIntervalMs;
  const jitter = 0.85 + Math.random() * 0.3;
  return Math.round(base * jitter);
}

function isCoindcxAuthTerminal(status: string): boolean {
  return status === 'requires_reauth' || status === 'invalid_credentials';
}

function maxId(a: string, b: string): string {
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    return BigInt(a) > BigInt(b) ? a : b;
  }
  return a > b ? a : b;
}

type NormalizedTrade = NonNullable<ReturnType<typeof normalizeCoindcxTradeRow>>;

async function persistCoindcxTrade(
  userId: string,
  connectionId: string,
  row: NormalizedTrade | null
): Promise<'inserted' | 'duplicate' | 'skip'> {
  if (!row) return 'skip';
  const idKey = `coindcx:${connectionId}:${row.tradeId}`;
  const claimed = await portfolioRepository.claimWebhookIdempotencyKey(idKey, 'coindcx');
  if (!claimed) return 'duplicate';

  const summary = [row.symbol, row.side].filter(Boolean).length
    ? `CoinDCX ${[row.side, row.symbol].filter(Boolean).join(' ')}`
    : 'CoinDCX trade';

  let saved;
  try {
    saved = await portfolioRepository.createEvent({
      userId,
      address:     syntheticAddress(connectionId),
      chain:       CHAIN,
      type:        'exchange_trade',
      rawEventCount: 1,
      transactionCount: 1,
      eventSummaries: [summary],
      enrichedData: normalizeEnrichedData({ source: 'coindcx', row: row.raw }),
      sourceType:  'exchange',
      sourceId:    connectionId,
      venue:       VENUE,
      providerTradeId: row.tradeId,
      providerTimestamp: row.timestampMs != null ? new Date(row.timestampMs) : new Date(),
      schemaVersion: PORTFOLIO_SCHEMA_VERSION,
      activity:    {
        txHash:   `coindcx:trade:${row.tradeId}`,
        tradeId:  row.tradeId,
        asset:    row.symbol,
        value:    row.quantity,
        txStatus: 'success',
      },
    });
  } catch (e: unknown) {
    const code = typeof e === 'object' && e !== null ? (e as { code?: number }).code : undefined;
    if (code === 11000) return 'duplicate';
    throw e;
  }

  publishWalletEventToSubscribers(saved);
  return 'inserted';
}

/**
 * One poll: balances + (optional) a single page of trades, cursor and freshness updates.
 * Caller must hold the Redis per-connection lock.
 */
export async function runCoindcxSyncForConnection(conn: IExchangeConnection): Promise<void> {
  const id = connectionIdString(conn);
  if (isCoindcxAuthTerminal(conn.status)) {
    return;
  }

  let creds: { apiKey: string; apiSecret: string };
  try {
    creds = decryptExchangeCredentials({
      encryptionKeyId: conn.encryptionKeyId,
      ciphertext: conn.encryptedSecretBlob,
    });
  } catch (e) {
    console.error('[ExchangeSync] decrypt failed', { connectionId: id, err: (e as Error).message });
    await portfolioRepository.updateExchangeConnectionById(id, {
      status: 'error',
      lastErrorAt: new Date(),
      lastErrorMessage: 'decrypt failed',
      nextPollAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
    });
    return;
  }

  if (conn.syncPhase === 'initial_backfill' && !config.exchangeBackfillEnabled) {
    await portfolioRepository.updateExchangeConnectionById(id, { syncPhase: 'live' });
    conn.syncPhase = 'live';
  }

  let blockTrades = false;
  const nextPoll = (): Date => new Date(Date.now() + computeNextPollMs(conn));

  // ── Balances ─────────────────────────────────────────────────────
  try {
    await coindcxService.getBalances(creds);
    await portfolioRepository.updateExchangeConnectionById(id, {
      lastBalancesSyncAt: new Date(),
      balancesFreshness: 'fresh',
      balancesLastError: undefined,
      balancesStaleReason: undefined,
    });
  } catch (e) {
    if (e instanceof CoindcxApiError) {
      if (e.code === 'invalid_credentials') {
        await portfolioRepository.updateExchangeConnectionById(id, {
          status: 'requires_reauth',
          balancesFreshness: 'stale',
          lastErrorAt: new Date(),
          lastErrorCode: e.code,
          lastErrorMessage: e.message,
          nextPollAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        return;
      }
      if (e.code === 'rate_limited') {
        const wait = e.retryAfterMs ?? 120_000;
        await portfolioRepository.updateExchangeConnectionById(id, {
          status: 'rate_limited',
          balancesLastError: e.message,
          lastErrorAt: new Date(),
          nextPollAt: new Date(Date.now() + wait),
        });
        return;
      }
    }
    await portfolioRepository.updateExchangeConnectionById(id, {
      balancesLastError: (e as Error).message,
      balancesFreshness: 'stale',
    });
    blockTrades = true;
  }

  if (!config.exchangeLiveSyncEnabled) {
    await portfolioRepository.updateExchangeConnectionById(id, {
      lastSuccessAt: new Date(),
      nextPollAt: nextPoll(),
    });
    return;
  }
  if (blockTrades) {
    await portfolioRepository.updateExchangeConnectionById(id, {
      nextPollAt: nextPoll(),
    });
    return;
  }

  // ── Trades (one page) ──────────────────────────────────────────────
  const cursor = conn.lastTradeId ?? conn.backfillCursor;
  const sort: 'asc' | 'desc' = 'asc';
  const limit = Math.min(config.exchangeBackfillChunkTrades, 500);

  const pageParams: Parameters<typeof coindcxService.getTradeHistoryPage>[1] = { sort, limit };
  if (cursor) {
    pageParams.fromId = String(cursor);
  } else if (conn.syncPhase === 'live') {
    // No cursor after skipping backfill: bound history window (avoids re-fetching full exchange history)
    const windowMs = 90 * 24 * 60 * 60 * 1000;
    pageParams.fromTimestamp = Date.now() - windowMs;
  }

  let trades: Record<string, unknown>[];
  try {
    trades = await coindcxService.getTradeHistoryPage(creds, pageParams);
  } catch (e) {
    if (e instanceof CoindcxApiError) {
      if (e.code === 'invalid_credentials') {
        await portfolioRepository.updateExchangeConnectionById(id, {
          status: 'requires_reauth',
          tradesFreshness: 'stale',
          lastErrorAt: new Date(),
          lastErrorCode: e.code,
          lastErrorMessage: e.message,
          nextPollAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        return;
      }
      if (e.code === 'rate_limited') {
        const wait = e.retryAfterMs ?? 120_000;
        await portfolioRepository.updateExchangeConnectionById(id, {
          status: 'rate_limited',
          tradesLastError: e.message,
          lastErrorAt: new Date(),
          nextPollAt: new Date(Date.now() + wait),
        });
        return;
      }
    }
    await portfolioRepository.updateExchangeConnectionById(id, {
      tradesLastError: (e as Error).message,
      tradesFreshness: 'stale',
    });
    await portfolioRepository.updateExchangeConnectionById(id, {
      lastSuccessAt: new Date(),
      nextPollAt: nextPoll(),
    });
    return;
  }

  if (!trades.length) {
    if (conn.syncPhase === 'initial_backfill') {
      await portfolioRepository.updateExchangeConnectionById(id, {
        syncPhase: 'live',
        backfillCursor: undefined,
      });
    }
    await portfolioRepository.updateExchangeConnectionById(id, {
      lastTradesSyncAt: new Date(),
      tradesFreshness: 'fresh',
      tradesLastError: undefined,
      lastSuccessAt: new Date(),
      nextPollAt: nextPoll(),
    });
    return;
  }

  let maxSeen = String(cursor ?? '');
  for (const row of trades) {
    const n = normalizeCoindcxTradeRow(row);
    if (n) {
      if (maxSeen) maxSeen = maxId(maxSeen, n.tradeId);
      else maxSeen = n.tradeId;
    }
  }

  let inserted = 0;
  for (const row of trades) {
    const n = normalizeCoindcxTradeRow(row);
    const r = await persistCoindcxTrade(conn.userId, id, n);
    if (r === 'inserted') inserted += 1;
  }

  if (maxSeen.length > 0) {
    await portfolioRepository.updateExchangeConnectionById(id, {
      lastTradeId: maxSeen,
      backfillCursor: conn.syncPhase === 'initial_backfill' ? maxSeen : undefined,
    });
  }

  const doneBackfill = conn.syncPhase === 'initial_backfill' && trades.length < limit;
  if (doneBackfill) {
    await portfolioRepository.updateExchangeConnectionById(id, { syncPhase: 'live', backfillCursor: undefined });
  }

  await portfolioRepository.updateExchangeConnectionById(id, {
    lastTradesSyncAt: new Date(),
    tradesFreshness: 'fresh',
    tradesLastError: undefined,
    lastSuccessAt: new Date(),
    lastErrorAt: undefined,
    nextPollAt: nextPoll(),
  });

  if (inserted > 0) {
    console.log('[ExchangeSync] trades persisted', { connectionId: id, inserted, page: trades.length });
  }
}

/**
 * Re-loads the connection, acquires no lock — caller must lock.
 */
export async function runCoindcxSyncByConnectionId(connectionId: string): Promise<void> {
  const conn = await portfolioRepository.findExchangeConnectionById(connectionId);
  if (!conn) return;
  await runCoindcxSyncForConnection(conn);
}
