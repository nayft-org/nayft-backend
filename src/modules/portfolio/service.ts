import { portfolioRepository } from './repository';
import { config } from '../../config/env';
import { alchemyNotify } from '../../utils/alchemyNotify';
import { zerionSubscriptions } from '../../utils/zerionSubscriptions';
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
      if (subId && subId !== config.zerionSubscriptionId) {
        // New subscription was created — patch wallets since it already has the address from creation
        console.log(`[PortfolioService] New Zerion subscription: ${subId}. Update ZERION_SUBSCRIPTION_ID in .env`);
      } else if (config.zerionSubscriptionId) {
        await zerionSubscriptions.patchWallets(config.zerionSubscriptionId, [address], []);
      }
    } catch (err) {
      console.error('[PortfolioService] Zerion subscription update failed:', err);
    }

    return wallet;
  },

  removeWallet: async (userId: string, walletId: string) => {
    const wallet = await portfolioRepository.findWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found');
    if (wallet.userId !== userId) throw new Error('Wallet not found');

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

    const deleted = await portfolioRepository.deleteWallet(walletId, userId);
    if (!deleted) throw new Error('Wallet not found');

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
};
