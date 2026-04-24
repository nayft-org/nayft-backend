import { portfolioRepository } from './repository';
import { config } from '../../config/env';
import { eventService } from '../../core/event-system';
import { alchemyNotify } from '../../utils/alchemyNotify';
import { zerionSubscriptions } from '../../utils/zerionSubscriptions';
import { alchemyApi } from '../../utils/alchemy';
import { getExplorerTxUrl } from '../../utils/explorerUrls';
import { fetchAndAggregateHoldings } from '../../utils/holdingsAggregator';
import { IWalletAddress } from './models/WalletAddress';
import { IWalletEvent } from './models/WalletEvent';

function shortAddress(address: string | undefined | null): string {
  if (!address) return 'n/a';
  const value = String(address).toLowerCase();
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export const portfolioService = {
  getSupportedChains: () => {
    return config.supportedChains
      .split(',')
      .map((raw) => raw.trim())
      .filter(Boolean)
      .map((id) => ({
        id,
        name:   id.charAt(0).toUpperCase() + id.slice(1),
        symbol: id.toUpperCase(),
      }));
  },

  addWallet: async (
    userId:  string,
    address: string,
    chains:  string[],
    label?:  string
  ) => {
    const normalizedAddress = address.trim().toLowerCase();
    console.log('[PortfolioService] addWallet start', {
      userId,
      address: shortAddress(normalizedAddress),
      chains,
      label: label ?? null,
    });
    const existing = await portfolioRepository.findWalletByAddress(normalizedAddress);
    if (existing) {
      if (existing.userId === userId) {
        throw new Error('Wallet already added');
      }
      throw new Error('This wallet is already monitored by another user');
    }

    const supportedIds = config.supportedChains.split(',').map((c) => c.trim());
    const invalid = chains.filter((c) => !supportedIds.includes(c));
    if (invalid.length > 0) throw new Error(`Unsupported chains: ${invalid.join(', ')}`);

    let wallet: IWalletAddress;
    try {
      wallet = await portfolioRepository.createWallet(userId, normalizedAddress, chains, label);
    } catch (error: unknown) {
      const code = typeof error === 'object' && error !== null ? (error as { code?: number }).code : undefined;
      if (code === 11000) {
        throw new Error('This wallet is already monitored by another user');
      }
      throw error;
    }
    await portfolioRepository.deleteHoldingsByUser(userId).catch(() => {});

    if (config.allowProviderSubscriptionWrites) {
      // Register address with Alchemy Address Activity webhooks (one per chain)
      for (const chain of chains) {
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
          chains,
          existingSubscriptionId: config.zerionSubscriptionId || null,
        });
        const subId = await zerionSubscriptions.ensureSubscription([normalizedAddress], chains);
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
      metadata: { address: normalizedAddress, chains: chains.length },
    }).catch(() => {});

    console.log('[PortfolioService] addWallet success', {
      userId,
      walletId: (wallet._id as { toString(): string }).toString(),
      address: shortAddress(normalizedAddress),
      chains,
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
    limit:  number
  ): Promise<IWalletEvent[]> => {
    console.log('[PortfolioService] getEvents', { userId, page, limit });
    return portfolioRepository.findEventsByUser(userId, page, limit);
  },

  getHoldings: async (userId: string, forceRefresh = false) => {
    console.log('[PortfolioService] getHoldings start', { userId, forceRefresh });
    const cached = await portfolioRepository.findHoldingsByUser(userId);
    if (config.holdingsReadModelPrimaryEnabled && cached && !forceRefresh) {
      console.log('[PortfolioService] getHoldings cache hit (read model primary)', {
        userId,
        positions: cached.positions?.length ?? 0,
        totalValue: cached.totalValue,
      });
      return {
        totalValue: cached.totalValue,
        absoluteChange24h: cached.absoluteChange24h,
        relativeChange24h: cached.relativeChange24h,
        positions: cached.positions ?? [],
      };
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
      return {
        totalValue:        cached.totalValue,
        absoluteChange24h: cached.absoluteChange24h,
        relativeChange24h: cached.relativeChange24h,
        positions:         cached.positions ?? [],
      };
    }

    const wallets = await portfolioRepository.findWalletsByUser(userId);
    if (wallets.length === 0) {
      console.log('[PortfolioService] getHoldings no wallets', { userId });
      return { totalValue: 0, absoluteChange24h: 0, relativeChange24h: 0, positions: [] };
    }

    const addresses = wallets.map((w) => w.address);
    console.log('[PortfolioService] getHoldings provider fetch', {
      userId,
      walletCount: wallets.length,
      addresses: addresses.map(shortAddress),
    });
    const aggregated = await fetchAndAggregateHoldings(addresses);
    await portfolioRepository.upsertHoldings(userId, aggregated);
    console.log('[PortfolioService] getHoldings provider fetch success', {
      userId,
      positions: aggregated.positions.length,
      totalValue: aggregated.totalValue,
    });
    return aggregated;
  },

  refreshEventStatuses: async (userId: string): Promise<{ updated: number }> => {
    const events = await portfolioRepository.findEventsNeedingStatusRefresh(userId, 20);
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
      const eventId = typeof event._id === 'string' ? event._id : (event._id as { toString(): string }).toString();
      await portfolioRepository.updateEventActivity(eventId, userId, {
        txStatus,
        explorerUrl: explorerUrl || undefined,
      });
      updated++;
    }
    return { updated };
  },
};
