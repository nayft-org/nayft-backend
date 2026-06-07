import { portfolioRepository } from './repository';
import { config } from '../../config/env';
import { coindcxService } from '../../integrations/coindcx/coindcxService';
import { CoindcxApiError } from '../../integrations/coindcx/coindcxErrors';
import { encryptExchangeCredentials } from './exchangeCrypto';
import { IExchangeConnection, ExchangeConnectionStatus } from './models/ExchangeConnection';
import { eventService } from '../../core/event-system';
import { alchemyNotify } from '../../utils/alchemyNotify';
import { zerionSubscriptions } from '../../utils/zerionSubscriptions';
import { alchemyApi } from '../../utils/alchemy';
import { getExplorerTxUrl } from '../../utils/explorerUrls';
import {
  buildMergedHoldingsForUser,
  getHoldingsBroadcastAddressesForUser,
  userHasPollableExchangeConnection,
} from './holdingsSync';
import { HoldingPositionFields } from './models/Holding';
import { IWalletAddress } from './models/WalletAddress';
import { IWalletEvent } from './models/WalletEvent';
import {
  getSelectionKind,
  listPortfolioChains,
  normalizePortfolioAddress,
  portfolioChainToDto,
  validatePortfolioChainSelection,
} from './chainRegistry';
import {
  PortfolioApiBlockedError,
  PortfolioRequestContext,
  PortfolioTriggerReason,
  isFreshnessApiAllowed,
  normalizePortfolioContext,
} from './sessionPolicy';
import { emitHoldingsDeltaUpdate, emitWalletStatusUpdate } from '../../services/walletEventAggregator';
import { recomputeEnqueueService } from '../portfolio-intelligence/services/recomputeEnqueue.service';
import { piConfig } from '../portfolio-intelligence/config/piConfig';
import { walletOwnershipCacheInvalidation } from '../../runtime/cacheInvalidation';

function shortAddress(address: string | undefined | null): string {
  if (!address) return 'n/a';
  const value = String(address).toLowerCase();
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function toHoldingsDto(data: {
  totalValue: number;
  absoluteChange24h: number;
  relativeChange24h: number;
  positions: HoldingPositionFields[];
}) {
  return {
    totalValue: data.totalValue,
    absoluteChange24h: data.absoluteChange24h,
    relativeChange24h: data.relativeChange24h,
    positions: (data.positions ?? []).map((p) => ({
      name:  p.name,
      symbol: p.symbol,
      quantity: p.quantity,
      value: p.value,
      chain: p.chain,
      ...(p.source != null ? { source: p.source } : {}),
      ...(p.venue != null ? { venue: p.venue } : {}),
      ...(p.sourceConnectionId != null ? { sourceConnectionId: p.sourceConnectionId } : {}),
    })),
  };
}

function assertFreshnessApiAllowed(
  context: PortfolioRequestContext,
  liveModeAllowedTriggers: PortfolioTriggerReason[],
  endpointLabel: string
): void {
  if (!isFreshnessApiAllowed(context, liveModeAllowedTriggers)) {
    throw new PortfolioApiBlockedError(
      `Blocked ${endpointLabel}: live session is stream-owned unless trigger is ${liveModeAllowedTriggers.join(', ')}`
    );
  }
}

function assertExchangePortfolioEnabled(): void {
  if (!config.exchangePortfolioEnabled) {
    throw new Error('EXCHANGE_DISABLED');
  }
}

function maskApiKey(apiKey: string): string {
  const k = apiKey.trim();
  if (k.length <= 8) return '••••';
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

function mapCoindcxError(e: unknown): string {
  if (e instanceof CoindcxApiError) {
    if (e.code === 'invalid_credentials') return 'CoinDCX API key or secret is invalid or revoked';
    if (e.code === 'rate_limited') return 'CoinDCX rate limit — try again shortly';
    if (e.code === 'provider_error') return 'CoinDCX is temporarily unavailable';
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return 'CoinDCX validation failed';
}

const EVENT_STATUS_REFRESH_SCAN_LIMIT = 200;

export const portfolioService = {
  getSupportedChains: () => {
    return listPortfolioChains().map(portfolioChainToDto);
  },

  addWallet: async (
    userId:  string,
    address: string,
    chains:  string[],
    label?:  string
  ) => {
    const selectedChains = validatePortfolioChainSelection(chains, listPortfolioChains());
    const normalizedChains = selectedChains.map((chain) => chain.id);
    const selectionKind = getSelectionKind(selectedChains);
    const normalizedAddress = normalizePortfolioAddress(address, selectionKind);
    console.log('[PortfolioService] addWallet start', {
      userId,
      address: shortAddress(normalizedAddress),
      chains: normalizedChains,
      label: label ?? null,
    });
    const existing = await portfolioRepository.findWalletByAddress(normalizedAddress);
    if (existing) {
      if (existing.userId === userId) {
        throw new Error('Wallet already added');
      }
      throw new Error('This wallet is already monitored by another user');
    }

    let wallet: IWalletAddress;
    try {
      wallet = await portfolioRepository.createWallet(userId, normalizedAddress, normalizedChains, label);
    } catch (error: unknown) {
      const code = typeof error === 'object' && error !== null ? (error as { code?: number }).code : undefined;
      if (code === 11000) {
        throw new Error('This wallet is already monitored by another user');
      }
      throw error;
    }
    await portfolioRepository.deleteHoldingsByUser(userId).catch(() => {});
    walletOwnershipCacheInvalidation.onWalletAddressesChanged(userId);

    if (piConfig.enqueueEnabled || piConfig.workerEnabled) {
      void recomputeEnqueueService.enqueue(userId, 'wallet_change', { bypassDebounce: true });
    }

    if (config.allowProviderSubscriptionWrites) {
      // Register address with Alchemy Address Activity webhooks (one per chain)
      for (const chain of normalizedChains) {
        const webhookId = alchemyNotify.getWebhookIdForChain(chain);
        if (webhookId) {
          console.log('[PortfolioService] Registering Alchemy webhook address', {
            userId,
            chain,
            address: shortAddress(normalizedAddress),
            webhookId,
          });
          await alchemyNotify.updateWebhookAddresses(webhookId, [normalizedAddress], []).catch((err) =>
            console.error(`[PortfolioService] Alchemy webhook register failed for chain=${chain}:`, err)
          );
        } else {
          console.warn(`[PortfolioService] No Alchemy webhook ID for chain="${chain}" — set ALCHEMY_WEBHOOK_IDS in .env`);
        }
      }

      // Register address with Zerion tx-subscription (creates subscription if not yet set)
      try {
        console.log('[PortfolioService] Registering Zerion subscription address', {
          userId,
          address: shortAddress(normalizedAddress),
          chains: normalizedChains,
          existingSubscriptionId: config.zerionSubscriptionId || null,
        });
        const subId = await zerionSubscriptions.ensureSubscription([normalizedAddress], normalizedChains);
        const createdNewSubscription = subId && subId !== config.zerionSubscriptionId;
        if (!createdNewSubscription && config.zerionSubscriptionId) {
          await zerionSubscriptions.patchWallets(config.zerionSubscriptionId, [normalizedAddress], []);
        }
        console.log('[PortfolioService] Zerion subscription ready', {
          userId,
          address: shortAddress(normalizedAddress),
          subscriptionId: subId,
          createdNewSubscription,
        });
      } catch (err) {
        console.error('[PortfolioService] Zerion subscription update failed:', err);
      }
    } else {
      console.warn(
        '[PortfolioService] allowProviderSubscriptionWrites=false — skipping Alchemy Notify and Zerion subscription updates'
      );
    }

    eventService.emitEvent({
      featureKey: 'portfolio_tracking',
      eventType: 'wallet_added',
      userId,
      metadata: {
        walletId: (wallet._id as { toString(): string }).toString(),
        chains: normalizedChains.length,
      },
    }).catch(() => {});

    console.log('[PortfolioService] addWallet success', {
      userId,
      walletId: (wallet._id as { toString(): string }).toString(),
      address: shortAddress(normalizedAddress),
      chains: normalizedChains,
    });
    return wallet;
  },

  removeWallet: async (userId: string, walletId: string) => {
    console.log('[PortfolioService] removeWallet start', { userId, walletId });
    const wallet = await portfolioRepository.findWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found');
    if (wallet.userId !== userId) throw new Error('Wallet not found');

    if (config.allowProviderSubscriptionWrites) {
      // Deregister address from Alchemy webhooks before deleting
      for (const chain of wallet.chains) {
        const webhookId = alchemyNotify.getWebhookIdForChain(chain);
        if (webhookId) {
          console.log('[PortfolioService] Deregistering Alchemy webhook address', {
            userId,
            chain,
            address: shortAddress(wallet.address),
            webhookId,
          });
          await alchemyNotify.updateWebhookAddresses(webhookId, [], [wallet.address]).catch((err) =>
            console.error(`[PortfolioService] Alchemy webhook deregister failed for chain=${chain}:`, err)
          );
        }
      }

      // Deregister address from Zerion subscription
      if (config.zerionSubscriptionId) {
        console.log('[PortfolioService] Deregistering Zerion subscription address', {
          userId,
          address: shortAddress(wallet.address),
          subscriptionId: config.zerionSubscriptionId,
        });
        await zerionSubscriptions
          .patchWallets(config.zerionSubscriptionId, [], [wallet.address])
          .catch((err) => console.error('[PortfolioService] Zerion subscription update failed:', err));
      }
    } else {
      console.warn(
        '[PortfolioService] allowProviderSubscriptionWrites=false — skipping Alchemy Notify and Zerion subscription deregistration'
      );
    }

    const deleted = await portfolioRepository.deleteWallet(walletId, userId);
    if (!deleted) throw new Error('Wallet not found');
    await portfolioRepository.deleteHoldingsByUser(userId).catch(() => {});
    walletOwnershipCacheInvalidation.onWalletAddressesChanged(userId);

    console.log('[PortfolioService] removeWallet success', {
      userId,
      walletId,
      address: shortAddress(wallet.address),
    });
    return { message: 'Wallet removed' };
  },

  getWallets: async (userId: string): Promise<IWalletAddress[]> => {
    return portfolioRepository.findWalletsByUser(userId);
  },

  getEvents: async (
    userId: string,
    page:   number,
    limit:  number,
    context?: Partial<PortfolioRequestContext>
  ): Promise<IWalletEvent[]> => {
    const ctx = normalizePortfolioContext(context);
    if (page <= 1) {
      assertFreshnessApiAllowed(ctx, ['manual_refresh', 'reconnect_recovery', 'stale_reconciliation'], 'GET /events');
    }
    console.log('[PortfolioService] getEvents', { userId, page, limit, context: ctx });
    return portfolioRepository.findEventsByUser(userId, page, limit);
  },

  getHoldings: async (
    userId: string,
    forceRefresh = false,
    context?: Partial<PortfolioRequestContext>
  ) => {
    const ctx = normalizePortfolioContext(context);
    console.log('[PortfolioService] getHoldings start', { userId, forceRefresh, context: ctx });
    const cached = await portfolioRepository.findHoldingsByUser(userId);
    if (config.holdingsReadModelPrimaryEnabled && cached && !forceRefresh) {
      console.log('[PortfolioService] getHoldings cache hit (read model primary)', {
        userId,
        positions: cached.positions?.length ?? 0,
        totalValue: cached.totalValue,
      });
      return toHoldingsDto(cached);
    }

    const now = Date.now();
    const cacheAge = cached?.syncedAt ? now - new Date(cached.syncedAt).getTime() : Infinity;
    const useCache = cached && cached.syncedAt && cacheAge < config.holdingsCacheTtlMs;
    const staleZero = cached && cached.totalValue === 0 && (cached.positions?.length ?? 0) === 0;
    if (useCache && !forceRefresh && !staleZero) {
      console.log('[PortfolioService] getHoldings cache hit', {
        userId,
        cacheAge,
        positions: cached.positions?.length ?? 0,
        totalValue: cached.totalValue,
      });
      return toHoldingsDto(cached);
    }

    const [wallets, hasExchange] = await Promise.all([
      portfolioRepository.findWalletsByUser(userId),
      userHasPollableExchangeConnection(userId),
    ]);
    if (wallets.length === 0 && !hasExchange) {
      console.log('[PortfolioService] getHoldings no wallets and no exchange', { userId });
      return { totalValue: 0, absoluteChange24h: 0, relativeChange24h: 0, positions: [] };
    }

    assertFreshnessApiAllowed(
      ctx,
      ['manual_refresh', 'reconnect_recovery', 'stale_reconciliation'],
      'GET /holdings'
    );

    const addresses = wallets.map((w) => w.address);
    console.log('[PortfolioService] getHoldings provider fetch', {
      userId,
      walletCount: wallets.length,
      hasExchange,
      addresses: addresses.map(shortAddress),
    });
    const merged = await buildMergedHoldingsForUser(userId);
    await portfolioRepository.upsertHoldings(userId, merged);
    if (piConfig.enqueueEnabled || piConfig.workerEnabled || piConfig.enabled || piConfig.shadowMode) {
      void recomputeEnqueueService.enqueue(userId, forceRefresh ? 'manual' : 'holdings_refresh', {
        bypassDebounce: forceRefresh,
        highPriority: forceRefresh,
      });
    }
    const broadcastAddrs = await getHoldingsBroadcastAddressesForUser(userId);
    emitHoldingsDeltaUpdate({
      userId,
      addresses: broadcastAddrs,
      source: 'api_snapshot',
      updatedAt: new Date().toISOString(),
      holdings: {
        totalValue: merged.totalValue,
        absoluteChange24h: merged.absoluteChange24h,
        relativeChange24h: merged.relativeChange24h,
        positions: merged.positions,
      },
    });
    console.log('[PortfolioService] getHoldings provider fetch success', {
      userId,
      positions: merged.positions.length,
      totalValue: merged.totalValue,
    });
    return toHoldingsDto(merged);
  },

  refreshEventStatuses: async (
    userId: string,
    context?: Partial<PortfolioRequestContext>
  ): Promise<{ updated: number }> => {
    const ctx = normalizePortfolioContext(context);
    assertFreshnessApiAllowed(
      ctx,
      ['manual_refresh', 'reconnect_recovery', 'stale_reconciliation'],
      'POST /events/refresh-status'
    );

    const events = await portfolioRepository.findEventsNeedingStatusRefresh(userId, EVENT_STATUS_REFRESH_SCAN_LIMIT);
    let updated = 0;
    for (const event of events) {
      const txHash = event.activity?.txHash?.trim();
      const chain = event.chain;
      if (!txHash || !chain) continue;
      const receipt = await alchemyApi.getTransactionReceipt(txHash, chain);
      if (!receipt) continue;
      const txStatus =
        receipt.status === '0x1' ? 'success'
        : receipt.status === '0x0' ? 'failed'
        : 'pending';
      const explorerUrl = getExplorerTxUrl(chain, txHash);
      const previousStatus = event.activity?.txStatus ?? null;
      const previousExplorer = event.activity?.explorerUrl ?? null;
      if (previousStatus === txStatus && previousExplorer === (explorerUrl || null)) {
        continue;
      }
      const eventId = typeof event._id === 'string' ? event._id : (event._id as { toString(): string }).toString();
      const updatedEvent = await portfolioRepository.updateEventActivity(eventId, userId, {
        txStatus,
        explorerUrl: explorerUrl || undefined,
      });
      if (updatedEvent?.activity?.txHash) {
        emitWalletStatusUpdate({
          userId,
          address: updatedEvent.address,
          chain: updatedEvent.chain,
          eventId,
          txHash: updatedEvent.activity.txHash,
          txStatus,
          explorerUrl: updatedEvent.activity.explorerUrl,
          updatedAt: new Date().toISOString(),
        });
      }
      updated++;
    }
    return { updated };
  },

  // ── CoinDCX / exchange connections (Phase 1 REST) ─────────────────

  listExchangeConnections: async (userId: string): Promise<IExchangeConnection[]> => {
    assertExchangePortfolioEnabled();
    return portfolioRepository.findExchangeConnectionsByUser(userId);
  },

  validateCoinDcx: async (apiKey: string, apiSecret: string): Promise<void> => {
    assertExchangePortfolioEnabled();
    try {
      await coindcxService.validateCredentials({ apiKey, apiSecret });
    } catch (e) {
      throw new Error(mapCoindcxError(e));
    }
  },

  linkCoinDcx: async (
    userId: string,
    input: { apiKey: string; apiSecret: string; label?: string }
  ): Promise<IExchangeConnection> => {
    assertExchangePortfolioEnabled();
    const n = await portfolioRepository.countExchangeConnectionsByUser(userId);
    if (n >= config.exchangeMaxConnectionsPerUser) {
      throw new Error(`At most ${config.exchangeMaxConnectionsPerUser} exchange connections per account`);
    }
    try {
      await coindcxService.validateCredentials({ apiKey: input.apiKey, apiSecret: input.apiSecret });
    } catch (e) {
      throw new Error(mapCoindcxError(e));
    }
    const enc = encryptExchangeCredentials({ apiKey: input.apiKey, apiSecret: input.apiSecret });
    return portfolioRepository.createExchangeConnection({
      userId,
      label: input.label,
      maskedApiKey: maskApiKey(input.apiKey),
      encryptedSecretBlob: enc.ciphertext,
      encryptionKeyId: enc.encryptionKeyId,
      secretVersion: 1,
      pollingIntervalMs: config.exchangeLivePollIntervalMs,
    });
  },

  patchCoinDcx: async (
    userId: string,
    id: string,
    input: { apiKey: string; apiSecret: string; label?: string }
  ): Promise<IExchangeConnection> => {
    assertExchangePortfolioEnabled();
    const existing = await portfolioRepository.findExchangeConnectionByIdAndUser(id, userId);
    if (!existing) throw new Error('Exchange connection not found');
    try {
      await coindcxService.validateCredentials({ apiKey: input.apiKey, apiSecret: input.apiSecret });
    } catch (e) {
      throw new Error(mapCoindcxError(e));
    }
    const enc = encryptExchangeCredentials({ apiKey: input.apiKey, apiSecret: input.apiSecret });
    const nextVersion = (existing.secretVersion ?? 1) + 1;
    const updated = await portfolioRepository.updateExchangeConnection(id, userId, {
      ...(input.label !== undefined ? { label: input.label } : {}),
      maskedApiKey: maskApiKey(input.apiKey),
      encryptedSecretBlob: enc.ciphertext,
      encryptionKeyId: enc.encryptionKeyId,
      secretVersion: nextVersion,
      status: 'active' as ExchangeConnectionStatus,
    });
    if (!updated) throw new Error('Exchange connection not found');
    return updated;
  },

  removeExchangeConnection: async (userId: string, id: string): Promise<{ eventsRemoved: number }> => {
    assertExchangePortfolioEnabled();
    const existing = await portfolioRepository.findExchangeConnectionByIdAndUser(id, userId);
    if (!existing) throw new Error('Exchange connection not found');
    const idStr = typeof existing._id === 'string' ? existing._id : (existing._id as { toString(): string }).toString();
    const eventsRemoved = await portfolioRepository.deleteEventsBySourceId(userId, idStr);
    const deleted = await portfolioRepository.deleteExchangeConnection(id, userId);
    if (!deleted) throw new Error('Exchange connection not found');
    await portfolioRepository.deleteHoldingsByUser(userId).catch(() => {});
    return { eventsRemoved };
  },
};
