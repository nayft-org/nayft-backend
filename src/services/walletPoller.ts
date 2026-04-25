/**
 * walletPoller.ts
 *
 * Polls Alchemy at a configurable interval for new transactions on every
 * registered wallet address+chain pair.
 *
 * Follows the same module-object export pattern used by binanceWebSocket.ts:
 *   export const walletPoller = { start, stop, addWallet, removeWallet }
 *
 * The "last seen block" per wallet+chain is tracked in an in-process Map so
 * that only new transactions are forwarded to the aggregator on each tick.
 */

import { config } from '../config/env';
import { alchemyApi } from '../utils/alchemy';
import { portfolioRepository } from '../modules/portfolio/repository';
import { ingestWalletEvent, WalletRawEvent } from './walletEventAggregator';
import { IWalletAddress } from '../modules/portfolio/models/WalletAddress';
import { WalletEventType } from '../modules/portfolio/models/WalletEvent';

interface ActiveWallet {
  walletId: string;
  userId:   string;
  address:  string;
  chains:   string[];
}

interface RecoveryWindowOptions {
  intervalMs?: number;
  durationMs?: number;
}

// key: "walletId:chain" → last seen block hex (e.g. "0x123abc")
const lastSeenBlock = new Map<string, string>();

// key: walletId → ActiveWallet
const activeWallets = new Map<string, ActiveWallet>();

let pollTimer: ReturnType<typeof setInterval> | null = null;
let recoveryStopTimer: ReturnType<typeof setTimeout> | null = null;
let recoveryMode = false;

// ── Polling tick ─────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  const wallets = Array.from(activeWallets.values());
  if (wallets.length === 0) return;

  await Promise.allSettled(
    wallets.flatMap((w) =>
      w.chains.map((chain) => pollWallet(w, chain))
    )
  );
}

async function pollWallet(wallet: ActiveWallet, chain: string): Promise<void> {
  const key      = `${wallet.walletId}:${chain}`;
  const fromBlock = lastSeenBlock.get(key) ?? '0x0';

  try {
    const transfers = await alchemyApi.getAssetTransfers(wallet.address, chain, fromBlock);
    if (transfers.length === 0) return;

    // Advance "last seen" to the highest block in this batch
    const latestBlock = transfers.reduce<string>((max, t) => {
      return t.blockNum > max ? t.blockNum : max;
    }, fromBlock);
    lastSeenBlock.set(key, latestBlock);

    // Build and ingest one event per transfer
    for (const tx of transfers) {
      const type: WalletEventType =
        tx.category === 'external' ? 'native_transfer' :
        tx.category === 'erc20'    ? 'token_transfer'  :
                                     'contract_interaction';

      const rawEvent: WalletRawEvent = {
        userId:   wallet.userId,
        address:  wallet.address,
        chain,
        txHash:   tx.hash,
        type,
        activity: {
          txHash:         tx.hash,
          blockNum:       tx.blockNum,
          asset:          tx.asset ?? undefined,
          value:          tx.value ? parseFloat(tx.value) : undefined,
          fromAddress:    tx.from?.toLowerCase(),
          toAddress:      tx.to?.toLowerCase(),
          tokenContract:  undefined,
          tokenDecimals:  undefined,
        },
      };
      ingestWalletEvent(rawEvent);
    }
  } catch (err) {
    console.error(`[WalletPoller] Poll failed for ${wallet.address} on ${chain}:`, err);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export const walletPoller = {
  /**
   * Compatibility wrapper; poller is recovery-only and bounded by a recovery window.
   */
  async start(): Promise<void> {
    await this.startRecoveryWindow();
  },

  /**
   * Starts a bounded recovery polling window to catch up missed wallet activity.
   * Polling is intentionally disabled as a steady-state updater.
   */
  async startRecoveryWindow(options: RecoveryWindowOptions = {}): Promise<void> {
    const intervalMs = Math.max(5000, options.intervalMs ?? config.walletPollIntervalMs);
    const durationMs = Math.max(intervalMs, options.durationMs ?? intervalMs * 3);

    recoveryMode = true;

    try {
      const wallets = await portfolioRepository.findAllActiveWallets();
      for (const w of wallets) {
        const id = (w._id as { toString(): string }).toString();
        activeWallets.set(id, walletFromDoc(w));
      }
    } catch (err) {
      console.error('[WalletPoller] Failed to load wallets from DB:', err);
    }

    if (pollTimer) {
      clearInterval(pollTimer);
    }
    pollTimer = setInterval(() => {
      if (!recoveryMode) return;
      tick().catch((err) => console.error('[WalletPoller] Tick error:', err));
    }, intervalMs);

    if (recoveryStopTimer) {
      clearTimeout(recoveryStopTimer);
    }
    recoveryStopTimer = setTimeout(() => {
      this.stop();
    }, durationMs);
  },

  stop(): void {
    recoveryMode = false;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (recoveryStopTimer) {
      clearTimeout(recoveryStopTimer);
      recoveryStopTimer = null;
    }
    activeWallets.clear();
    lastSeenBlock.clear();
  },

  /**
   * Add a newly registered wallet to the live polling set immediately
   * (no restart needed).
   */
  addWallet(wallet: IWalletAddress): void {
    const id = (wallet._id as { toString(): string }).toString();
    activeWallets.set(id, walletFromDoc(wallet));
  },

  /**
   * Remove a deleted wallet from the live polling set immediately.
   */
  removeWallet(walletId: string): void {
    const wallet = activeWallets.get(walletId);
    if (wallet) {
      for (const chain of wallet.chains) {
        lastSeenBlock.delete(`${walletId}:${chain}`);
      }
    }
    activeWallets.delete(walletId);
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function walletFromDoc(doc: IWalletAddress): ActiveWallet {
  return {
    walletId: (doc._id as { toString(): string }).toString(),
    userId:   doc.userId,
    address:  doc.address,
    chains:   doc.chains,
  };
}
