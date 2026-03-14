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
import { portfolioRepository } from '../modules/portfolio/repository';
import {
  IWalletEvent,
  WalletEventType,
  WalletEventActivityFields,
} from '../modules/portfolio/models/WalletEvent';

export interface WalletRawEvent {
  userId:   string;
  address:  string;
  chain:    string;
  txHash:   string;
  type:     WalletEventType;
  activity: WalletEventActivityFields;
}

// ── In-memory state (same pattern as klineIngester) ─────────────────────────

// key: "address:chain" → queued raw events
const eventBuffer = new Map<string, WalletRawEvent[]>();

// key: address → expiry timestamp of active cooldown
const cooldownMap = new Map<string, number>();

// key: "address:chain" → pending flush timer
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Subscribers notified after each aggregated event is stored
type EventCallback = (event: IWalletEvent) => void;
const subscribers = new Set<EventCallback>();

// ── Public API ───────────────────────────────────────────────────────────────

export function subscribeToWalletEvents(cb: EventCallback): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function ingestWalletEvent(event: WalletRawEvent): void {
  console.log('ingestWalletEvent', event);
  const cooldownExpiry = cooldownMap.get(event.address);
  if (cooldownExpiry && Date.now() < cooldownExpiry) {
    // Wallet is in cooldown — suppress until cooldown expires
    return;
  }

  const key = `${event.address}:${event.chain}`;
  const existing = eventBuffer.get(key) ?? [];
  existing.push(event);
  eventBuffer.set(key, existing);

  scheduleFlush(key);
}

// ── Internal ─────────────────────────────────────────────────────────────────

function scheduleFlush(key: string): void {
  console.log('scheduleFlush', key);
  if (flushTimers.has(key)) return; // already scheduled

  const timer = setTimeout(async () => {
    flushTimers.delete(key);
    await flushBuffer(key);
  }, config.eventAggregationWindowMs);

  flushTimers.set(key, timer);
}

async function flushBuffer(key: string): Promise<void> {
  console.log('flushBuffer', key);
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

  let enrichedData: Record<string, unknown> | null = null;
  let eventType: WalletEventType = events[0].type;
  console.log('chainsWithActivity', chainsWithActivity);
  try {
    if (chainsWithActivity.size > 1) {
      // Case A: same wallet across multiple chains → Zerion
      eventType = 'multi_chain_activity';
      const portfolio = await zerionApi.getWalletPortfolio(address);
      const positions = await zerionApi.getWalletPositions(address);
      enrichedData = { source: 'zerion', portfolio, positions };
    } else {
      // Case B: single chain → Alchemy
      console.log('getAssetTransfers', address, chain);
      const transfers = await alchemyApi.getAssetTransfers(address, chain);
      enrichedData = { source: 'alchemy', transfers };
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
    const saved = await portfolioRepository.createEvent({
      userId,
      address,
      chain,
      type:          eventType,
      rawEventCount: events.length,
      enrichedData,
      activity:      primaryActivity,
    });

    // Set cooldown for this address
    cooldownMap.set(address, Date.now() + config.walletEventCooldownMs);

    // Notify WebSocket subscribers
    for (const cb of subscribers) {
      try {
        cb(saved);
      } catch (e) {
        console.error('[WalletAggregator] Subscriber error:', e);
      }
    }
  } catch (err) {
    console.error(`[WalletAggregator] DB write failed for ${key}:`, err);
  }
}
