import { portfolioRepository } from './repository';
import { config } from '../../config/env';
import { IWalletAddress } from './models/WalletAddress';
import { IWalletEvent } from './models/WalletEvent';

// Lazily required to avoid circular imports at module load time
function getWalletPoller() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../services/walletPoller').walletPoller as {
    addWallet(wallet: IWalletAddress): void;
    removeWallet(walletId: string): void;
  };
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
    const existing = await portfolioRepository.findWalletByUserAndAddress(userId, address);
    if (existing) throw new Error('Wallet already added');

    const supportedIds = config.supportedChains
      .split(',')
      .map((c) => c.trim());

    const invalid = chains.filter((c) => !supportedIds.includes(c));
    if (invalid.length > 0) {
      throw new Error(`Unsupported chains: ${invalid.join(', ')}`);
    }

    const wallet = await portfolioRepository.createWallet(userId, address, chains, label);
    getWalletPoller().addWallet(wallet);
    return wallet;
  },

  removeWallet: async (userId: string, walletId: string) => {
    const wallet = await portfolioRepository.findWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found');
    if (wallet.userId !== userId) throw new Error('Wallet not found');

    const deleted = await portfolioRepository.deleteWallet(walletId, userId);
    if (!deleted) throw new Error('Wallet not found');

    getWalletPoller().removeWallet(walletId);
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
