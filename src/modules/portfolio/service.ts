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
    const existing = await portfolioRepository.findWalletByUserAndAddress(userId, address);
    if (existing) throw new Error('Wallet already added');

    const supportedIds = config.supportedChains.split(',').map((c) => c.trim());
    const invalid = chains.filter((c) => !supportedIds.includes(c));
    if (invalid.length > 0) throw new Error(`Unsupported chains: ${invalid.join(', ')}`);

    const wallet = await portfolioRepository.createWallet(userId, address, chains, label);
    await portfolioRepository.deleteHoldingsByUser(userId).catch(() => {});

    if (config.allowProviderSubscriptionWrites) {
      // Register address with Alchemy Address Activity webhooks (one per chain)
      for (const chain of chains) {
        const webhookId = alchemyNotify.getWebhookIdForChain(chain);
        if (webhookId) {
          await alchemyNotify.updateWebhookAddresses(webhookId, [address], []).catch((err) =>
            console.error(`[PortfolioService] Alchemy webhook register failed for chain=${chain}:`, err)
          );
        } else {
          console.warn(`[PortfolioService] No Alchemy webhook ID for chain="${chain}" — set ALCHEMY_WEBHOOK_IDS in .env`);
        }
      }

      // Register address with Zerion tx-subscription (creates subscription if not yet set)
      try {
        const subId = await zerionSubscriptions.ensureSubscription([address], chains);
        const createdNewSubscription = subId && subId !== config.zerionSubscriptionId;
        if (!createdNewSubscription && config.zerionSubscriptionId) {
          await zerionSubscriptions.patchWallets(config.zerionSubscriptionId, [address], []);
        }
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
      metadata: { address, chains: chains.length },
    }).catch(() => {});

    return wallet;
  },

  removeWallet: async (userId: string, walletId: string) => {
    const wallet = await portfolioRepository.findWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found');
    if (wallet.userId !== userId) throw new Error('Wallet not found');

    if (config.allowProviderSubscriptionWrites) {
      // Deregister address from Alchemy webhooks before deleting
      for (const chain of wallet.chains) {
        const webhookId = alchemyNotify.getWebhookIdForChain(chain);
        if (webhookId) {
          await alchemyNotify.updateWebhookAddresses(webhookId, [], [wallet.address]).catch((err) =>
            console.error(`[PortfolioService] Alchemy webhook deregister failed for chain=${chain}:`, err)
          );
        }
      }

      // Deregister address from Zerion subscription
      if (config.zerionSubscriptionId) {
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
    return portfolioRepository.findEventsByUser(userId, page, limit);
  },

  getHoldings: async (userId: string, forceRefresh = false) => {
    const cached = await portfolioRepository.findHoldingsByUser(userId);
    if (config.holdingsReadModelPrimaryEnabled && cached && !forceRefresh) {
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
      return {
        totalValue:        cached.totalValue,
        absoluteChange24h: cached.absoluteChange24h,
        relativeChange24h: cached.relativeChange24h,
        positions:         cached.positions ?? [],
      };
    }

    const wallets = await portfolioRepository.findWalletsByUser(userId);
    if (wallets.length === 0) {
      return { totalValue: 0, absoluteChange24h: 0, relativeChange24h: 0, positions: [] };
    }

    const addresses = wallets.map((w) => w.address);
    const aggregated = await fetchAndAggregateHoldings(addresses);
    await portfolioRepository.upsertHoldings(userId, aggregated);
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
