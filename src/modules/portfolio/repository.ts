import { WalletAddress, IWalletAddress } from './models/WalletAddress';
import { WalletEvent, IWalletEvent } from './models/WalletEvent';

export const portfolioRepository = {
  // ── WalletAddress ────────────────────────────────────────────────

  findWalletsByUser: async (userId: string): Promise<IWalletAddress[]> => {
    return WalletAddress.find({ userId }).sort({ createdAt: -1 });
  },

  findWalletById: async (id: string): Promise<IWalletAddress | null> => {
    return WalletAddress.findById(id);
  },

  findWalletByUserAndAddress: async (
    userId: string,
    address: string
  ): Promise<IWalletAddress | null> => {
    return WalletAddress.findOne({ userId, address });
  },

  findAllActiveWallets: async (): Promise<IWalletAddress[]> => {
    return WalletAddress.find({});
  },

  createWallet: async (
    userId: string,
    address: string,
    chains: string[],
    label?: string
  ): Promise<IWalletAddress> => {
    const wallet = new WalletAddress({ userId, address, chains, label });
    return wallet.save();
  },

  deleteWallet: async (id: string, userId: string): Promise<boolean> => {
    const result = await WalletAddress.deleteOne({ _id: id, userId });
    return result.deletedCount > 0;
  },

  // ── WalletEvent ──────────────────────────────────────────────────

  createEvent: async (data: {
    userId:        string;
    address:       string;
    chain:         string;
    type:          IWalletEvent['type'];
    rawEventCount: number;
    enrichedData:  Record<string, unknown> | null;
  }): Promise<IWalletEvent> => {
    const event = new WalletEvent({ ...data, aggregatedAt: new Date() });
    return event.save();
  },

  findEventsByUser: async (
    userId: string,
    page:   number = 1,
    limit:  number = 20
  ): Promise<IWalletEvent[]> => {
    const skip = (page - 1) * limit;
    return WalletEvent.find({ userId })
      .sort({ aggregatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean() as unknown as IWalletEvent[];
  },
};
