/**
 * walletEventAggregator.ts
 *
 * In-memory event buffer following the same setTimeout-debounce + in-process Map
 * pattern used by klineIngester.ts and aggTradeIngester.ts.
 *
 * Case A — same wallet address has events on >1 chain within the window:
 *   → enrich via Zerion portfolio API
 *
 * Case B — single chain for this address within the window:
 *   → enrich via Alchemy asset-transfers API
 */

import { config } from '../config/env';
import { alchemyApi } from '../utils/alchemy';
import { zerionApi } from '../utils/zerion';
import { getExplorerTxUrl } from '../utils/explorerUrls';
import { getTransactionCount, buildEventSummaries } from '../utils/eventSummaryBuilder';
import { portfolioRepository } from '../modules/portfolio/repository';
import {
  IWalletEvent,
  WalletEventType,
  WalletEventActivityFields,
  TxStatus,
} from '../modules/portfolio/models/WalletEvent';

function shortAddress(address: string | undefined | null): string {
  if (!address) return 'n/a';
  const value = String(address).toLowerCase();
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function shortHash(hash: string | undefined | null): string {
  if (!hash) return 'n/a';
  const value = String(hash);
  if (value.length <= 14) return value;
  return `${value.slice(0, 10)}...${value.slice(-4)}`;
}

export interface WalletRawEvent {
  userId:   string;
  address:  string;
  chain:    string;
  txHash:   string;
  type:     WalletEventType;
  activity: WalletEventActivityFields;
}

export interface PortfolioHoldingsSnapshot {
  totalValue: number;
  absoluteChange24h: number;
  relativeChange24h: number;
  positions: Array<{ name: string; symbol: string; quantity: number; value: number; chain: string }>;
}

export interface PortfolioStatusUpdate {
  userId: string;
  address: string;
  chain: string;
  eventId: string;
  txHash: string;
  txStatus: TxStatus;
  explorerUrl?: string;
  updatedAt: string;
}

export interface PortfolioHoldingsDelta {
  userId: string;
  addresses: string[];
  holdings: PortfolioHoldingsSnapshot;
  source: 'zerion_live' | 'api_snapshot';
  updatedAt: string;
}

export type PortfolioRealtimeMessage =
  | { type: 'wallet_event'; event: IWalletEvent }
  | { type: 'wallet_status'; update: PortfolioStatusUpdate }
  | { type: 'holdings_delta'; delta: PortfolioHoldingsDelta };

// ── In-memory state (same pattern as klineIngester) ─────────────────────────

// key: "address:chain" → queued raw events
const eventBuffer = new Map<string, WalletRawEvent[]>();

// key: address → expiry timestamp of active cooldown
const cooldownMap = new Map<string, number>();

// key: "address:chain" → pending flush timer
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Subscribers notified after each canonical realtime message is emitted
type PortfolioRealtimeCallback = (message: PortfolioRealtimeMessage) => void;
const realtimeSubscribers = new Set<PortfolioRealtimeCallback>();

// ── Public API ───────────────────────────────────────────────────────────────

export function subscribeToPortfolioRealtime(cb: PortfolioRealtimeCallback): () => void {
  realtimeSubscribers.add(cb);
  return () => realtimeSubscribers.delete(cb);
}

/**
 * Backward-compatible helper for consumers that only care about wallet_event.
 */
export function subscribeToWalletEvents(cb: (event: IWalletEvent) => void): () => void {
  const wrapped = (message: PortfolioRealtimeMessage): void => {
    if (message.type === 'wallet_event') cb(message.event);
  };
  realtimeSubscribers.add(wrapped);
  return () => realtimeSubscribers.delete(wrapped);
}

export function emitWalletStatusUpdate(update: PortfolioStatusUpdate): void {
  notifyRealtimeSubscribers({ type: 'wallet_status', update });
}

export function emitHoldingsDeltaUpdate(delta: PortfolioHoldingsDelta): void {
  notifyRealtimeSubscribers({ type: 'holdings_delta', delta });
}

export function ingestWalletEvent(event: WalletRawEvent): void {
  const cooldownExpiry = cooldownMap.get(event.address);
  if (cooldownExpiry && Date.now() < cooldownExpiry) {
    // Keep the signal in logs, but do not drop the event before persistence.
    console.log('[WalletAggregator] Cooldown active; buffering event anyway', {
      userId: event.userId,
      chain: event.chain,
      address: shortAddress(event.address),
      txHash: shortHash(event.txHash),
      cooldownMsRemaining: cooldownExpiry - Date.now(),
    });
  }

  const key = `${event.address}:${event.chain}`;
  const existing = eventBuffer.get(key) ?? [];
  existing.push(event);
  eventBuffer.set(key, existing);
  console.log('[WalletAggregator] Buffered raw event', {
    userId: event.userId,
    chain: event.chain,
    address: shortAddress(event.address),
    txHash: shortHash(event.txHash),
    type: event.type,
    bufferedCount: existing.length,
  });

  scheduleFlush(key);
}

// ── Internal ─────────────────────────────────────────────────────────────────

function scheduleFlush(key: string): void {
  if (flushTimers.has(key)) return; // already scheduled
  console.log('[WalletAggregator] Scheduled flush', {
    key,
    windowMs: config.eventAggregationWindowMs,
  });

  const timer = setTimeout(async () => {
    flushTimers.delete(key);
    await flushBuffer(key);
  }, config.eventAggregationWindowMs);

  flushTimers.set(key, timer);
}

async function flushBuffer(key: string): Promise<void> {
  const events = eventBuffer.get(key);
  if (!events || events.length === 0) {
    eventBuffer.delete(key);
    return;
  }
  eventBuffer.delete(key);

  const [address, chain] = key.split(':');
  const userId = events[0].userId;

  // Determine which chains this address currently has events buffered for
  const chainsWithActivity = new Set<string>();
  chainsWithActivity.add(chain);
  for (const buffKey of eventBuffer.keys()) {
    const [buffAddr] = buffKey.split(':');
    if (buffAddr === address) {
      const [, buffChain] = buffKey.split(':');
      chainsWithActivity.add(buffChain);
    }
  }
  console.log('[WalletAggregator] Flushing buffer', {
    userId,
    chain,
    address: shortAddress(address),
    bufferedEvents: events.length,
    chainsWithActivity: [...chainsWithActivity],
  });

  let enrichedData: Record<string, unknown> | null = null;
  let eventType: WalletEventType = events[0].type;
  let holdingsDelta: PortfolioHoldingsDelta | null = null;
  try {
    if (chainsWithActivity.size > 1) {
      // Case A: same wallet across multiple chains → Zerion
      eventType = 'multi_chain_activity';
      console.log('[WalletAggregator] Enrichment start', {
        source: 'zerion',
        userId,
        address: shortAddress(address),
        chains: [...chainsWithActivity],
      });
      const portfolio = await zerionApi.getWalletPortfolio(address);
      const positions = await zerionApi.getWalletPositions(address);
      enrichedData = { source: 'zerion', portfolio, positions };
      console.log('[WalletAggregator] Enrichment success', {
        source: 'zerion',
        address: shortAddress(address),
        positions: positions.length,
      });

      // Opportunistic holdings cache update: only when user has exactly 1 wallet (complete data)
      try {
        const wallets = await portfolioRepository.findWalletsByUser(userId);
        const normalizedAddr = address.toLowerCase();
        if (
          wallets.length === 1 &&
          wallets[0].address?.toLowerCase() === normalizedAddr
        ) {
          const totalValue =
            positions.length > 0
              ? positions.reduce((s, p) => s + (p.value ?? 0), 0)
              : portfolio.totalValue;
          await portfolioRepository.upsertHoldings(userId, {
            totalValue,
            absoluteChange24h: portfolio.absoluteChange24h,
            relativeChange24h:  portfolio.relativeChange24h,
            positions,
          });
          holdingsDelta = {
            userId,
            addresses: [normalizedAddr],
            source: 'zerion_live',
            updatedAt: new Date().toISOString(),
            holdings: {
              totalValue,
              absoluteChange24h: portfolio.absoluteChange24h,
              relativeChange24h: portfolio.relativeChange24h,
              positions,
            },
          };
        }
      } catch (holdErr) {
        console.error(`[WalletAggregator] Opportunistic holdings upsert failed:`, holdErr);
      }
    } else {
      // Case B: single chain → Alchemy
      console.log('[WalletAggregator] Enrichment start', {
        source: 'alchemy',
        userId,
        chain,
        address: shortAddress(address),
      });
      const transfers = await alchemyApi.getAssetTransfers(address, chain);
      enrichedData = { source: 'alchemy', transfers };
      console.log('[WalletAggregator] Enrichment success', {
        source: 'alchemy',
        chain,
        address: shortAddress(address),
        transfers: transfers.length,
      });
    }
  } catch (err) {
    console.error(`[WalletAggregator] Enrichment failed for ${key}:`, err);
    enrichedData = null;
  }

  try {
    const first = events[0];
    const primaryActivity = first.activity ?? {
      txHash: first.txHash,
      blockNum: undefined,
      asset: undefined,
      value: undefined,
      fromAddress: undefined,
      toAddress: undefined,
      tokenContract: undefined,
      tokenDecimals: undefined,
    };

    // Fetch tx status via eth_getTransactionReceipt and build explorer URL
    const txHash = primaryActivity.txHash?.trim();
    if (txHash) {
      console.log('[WalletAggregator] Fetching tx receipt', {
        chain,
        address: shortAddress(address),
        txHash: shortHash(txHash),
      });
      const receipt = await alchemyApi.getTransactionReceipt(txHash, chain);
      if (receipt) {
        primaryActivity.txStatus =
          receipt.status === '0x1' ? 'success'
          : receipt.status === '0x0' ? 'failed'
          : 'pending';
      } else {
        primaryActivity.txStatus = 'pending';
      }
      const explorerUrl = getExplorerTxUrl(chain, txHash);
      if (explorerUrl) primaryActivity.explorerUrl = explorerUrl;
    }

    const transactionCount = getTransactionCount(events);
    const eventSummaries = buildEventSummaries(events, address);

    const saved = await portfolioRepository.createEvent({
      userId,
      address,
      chain,
      type:              eventType,
      rawEventCount:     events.length,
      transactionCount,
      eventSummaries,
      enrichedData,
      activity:          primaryActivity,
    });
    console.log('[WalletAggregator] Event saved', {
      eventId: typeof saved._id === 'string' ? saved._id : saved._id?.toString?.(),
      userId,
      chain,
      address: shortAddress(address),
      txHash: shortHash(primaryActivity.txHash),
      eventType,
      rawEventCount: events.length,
      transactionCount,
      summaries: eventSummaries.length,
      enrichedSource: (enrichedData?.source as string | undefined) ?? 'none',
      txStatus: primaryActivity.txStatus ?? 'unknown',
    });

    // Set cooldown for this address
    cooldownMap.set(address, Date.now() + config.walletEventCooldownMs);

    notifyRealtimeSubscribers({ type: 'wallet_event', event: saved });

    const statusTxHash = primaryActivity.txHash?.trim();
    const txStatus = primaryActivity.txStatus;
    if (statusTxHash && txStatus) {
      emitWalletStatusUpdate({
        userId,
        address,
        chain,
        eventId: typeof saved._id === 'string' ? saved._id : saved._id?.toString?.() ?? '',
        txHash: statusTxHash,
        txStatus,
        explorerUrl: primaryActivity.explorerUrl,
        updatedAt: new Date().toISOString(),
      });
    }

    if (holdingsDelta) {
      emitHoldingsDeltaUpdate(holdingsDelta);
    }
  } catch (err) {
    console.error(`[WalletAggregator] DB write failed for ${key}:`, err);
  }
}

function notifyRealtimeSubscribers(message: PortfolioRealtimeMessage): void {
  for (const cb of realtimeSubscribers) {
    try {
      cb(message);
    } catch (e) {
      console.error('[WalletAggregator] Subscriber error:', e);
    }
  }
}
