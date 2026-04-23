import { WalletAddress, IWalletAddress } from './models/WalletAddress';
import { WalletEvent, IWalletEvent, WalletEventActivityFields } from './models/WalletEvent';
import { Holding, IHolding, HoldingPositionFields } from './models/Holding';
import {
  PortfolioWebhookIdempotency,
  WebhookIdempotencyProvider,
} from './models/PortfolioWebhookIdempotency';

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
    return WalletAddress.findOne({ userId, address: address.toLowerCase() });
  },

  /** Used by webhook controller to resolve userId from an incoming address. */
  findWalletByAddress: async (address: string): Promise<IWalletAddress | null> => {
    return WalletAddress.findOne({ address: address.toLowerCase() });
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
    const normalized = address.toLowerCase();
    const wallet = new WalletAddress({ userId, address: normalized, chains, label });
    return wallet.save();
  },

  deleteWallet: async (id: string, userId: string): Promise<boolean> => {
    const result = await WalletAddress.deleteOne({ _id: id, userId });
    return result.deletedCount > 0;
  },

  // ── WalletEvent ──────────────────────────────────────────────────

  createEvent: async (data: {
    userId:            string;
    address:           string;
    chain:             string;
    type:              IWalletEvent['type'];
    rawEventCount:     number;
    transactionCount?: number;
    eventSummaries?:   string[];
    enrichedData:      Record<string, unknown> | null;
    activity?:         WalletEventActivityFields;
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

  findEventByIdAndUser: async (eventId: string, userId: string): Promise<IWalletEvent | null> => {
    return WalletEvent.findOne({ _id: eventId, userId });
  },

  updateEventActivity: async (
    eventId: string,
    userId: string,
    activity: Partial<WalletEventActivityFields>
  ): Promise<IWalletEvent | null> => {
    const event = await WalletEvent.findOne({ _id: eventId, userId });
    if (!event) return null;
    if (event.activity) {
      Object.assign(event.activity, activity);
    } else {
      event.activity = activity as WalletEventActivityFields;
    }
    await event.save();
    return event;
  },

  findEventsNeedingStatusRefresh: async (
    userId: string,
    limit: number = 20
  ): Promise<IWalletEvent[]> => {
    return WalletEvent.find({
      userId,
      'activity.txHash': { $exists: true, $ne: '' },
      $or: [
        { 'activity.txStatus': { $exists: false } },
        { 'activity.txStatus': null },
        { 'activity.txStatus': 'pending' },
      ],
    })
      .sort({ aggregatedAt: -1 })
      .limit(limit)
      .lean() as unknown as IWalletEvent[];
  },

  // ── Holding ──────────────────────────────────────────────────────

  findHoldingsByUser: async (userId: string): Promise<IHolding | null> => {
    return Holding.findOne({ userId }).lean() as unknown as IHolding | null;
  },

  upsertHoldings: async (
    userId: string,
    data: {
      totalValue:        number;
      absoluteChange24h: number;
      relativeChange24h: number;
      positions:         HoldingPositionFields[];
    }
  ): Promise<IHolding> => {
    const now = new Date();
    const result = await Holding.findOneAndUpdate(
      { userId },
      {
        $set: {
          ...data,
          syncedAt: now,
        },
      },
      { upsert: true, new: true }
    );
    return result as IHolding;
  },

  deleteHoldingsByUser: async (userId: string): Promise<boolean> => {
    const result = await Holding.deleteOne({ userId });
    return result.deletedCount > 0;
  },

  /**
   * Insert idempotency row before processing a webhook line. Returns false if duplicate (Mongo 11000).
   */
  claimWebhookIdempotencyKey: async (
    dedupeKey: string,
    provider: WebhookIdempotencyProvider
  ): Promise<boolean> => {
    try {
      await PortfolioWebhookIdempotency.create({
        dedupeKey,
        provider,
        createdAt: new Date(),
      });
      return true;
    } catch (e: unknown) {
      const code = typeof e === 'object' && e !== null ? (e as { code?: number }).code : undefined;
      if (code === 11000) return false;
      throw e;
    }
  },
};
