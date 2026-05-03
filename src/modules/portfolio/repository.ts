import { WalletAddress, IWalletAddress } from './models/WalletAddress';
import {
  WalletEvent,
  IWalletEvent,
  WalletEventActivityFields,
  WalletEventSourceType,
} from './models/WalletEvent';
import { Holding, IHolding, HoldingPositionFields } from './models/Holding';
import {
  PortfolioWebhookIdempotency,
  WebhookIdempotencyProvider,
} from './models/PortfolioWebhookIdempotency';
import {
  ExchangeConnection,
  IExchangeConnection,
  ExchangeConnectionStatus,
} from './models/ExchangeConnection';

function shortAddress(address: string | undefined | null): string {
  if (!address) return 'n/a';
  const value = String(address).toLowerCase();
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

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
    const normalized = address.toLowerCase();
    const wallet = await WalletAddress.findOne({ address: normalized });
    console.log('[PortfolioRepository] findWalletByAddress', {
      address: shortAddress(normalized),
      found: Boolean(wallet),
      userId: wallet?.userId ?? null,
    });
    return wallet;
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
    sourceType?:       WalletEventSourceType;
    sourceId?:         string;
    venue?:            string;
    providerTradeId?:  string;
    providerTimestamp?: Date;
    schemaVersion?:    number;
  }): Promise<IWalletEvent> => {
    const event = new WalletEvent({ ...data, aggregatedAt: new Date() });
    const saved = await event.save();
    console.log('[PortfolioRepository] createEvent', {
      eventId: typeof saved._id === 'string' ? saved._id : saved._id?.toString?.(),
      userId: data.userId,
      chain: data.chain,
      address: shortAddress(data.address),
      summaries: data.eventSummaries?.length ?? 0,
      hasActivity: Boolean(data.activity),
      enrichedSource: (data.enrichedData?.source as string | undefined) ?? 'none',
    });
    return saved;
  },

  findEventsByUser: async (
    userId: string,
    page:   number = 1,
    limit:  number = 20
  ): Promise<IWalletEvent[]> => {
    const skip = (page - 1) * limit;
    const events = await WalletEvent.find({ userId })
      .sort({ aggregatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean() as unknown as IWalletEvent[];
    console.log('[PortfolioRepository] findEventsByUser', {
      userId,
      page,
      limit,
      returned: events.length,
    });
    return events;
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
      $and: [
        { $or: [{ sourceType: { $exists: false } }, { sourceType: 'wallet' }] },
        {
          $or: [
            { 'activity.txStatus': { $exists: false } },
            { 'activity.txStatus': null },
            { 'activity.txStatus': 'pending' },
          ],
        },
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
      console.log('[PortfolioRepository] claimWebhookIdempotencyKey accepted', {
        provider,
        dedupeKey,
      });
      return true;
    } catch (e: unknown) {
      const code = typeof e === 'object' && e !== null ? (e as { code?: number }).code : undefined;
      if (code === 11000) {
        console.log('[PortfolioRepository] claimWebhookIdempotencyKey duplicate', {
          provider,
          dedupeKey,
        });
        return false;
      }
      throw e;
    }
  },

  // ── ExchangeConnection ────────────────────────────────────────────

  countExchangeConnectionsByUser: async (userId: string): Promise<number> => {
    return ExchangeConnection.countDocuments({ userId });
  },

  findExchangeConnectionsByUser: async (userId: string): Promise<IExchangeConnection[]> => {
    return ExchangeConnection.find({ userId }).sort({ createdAt: -1 });
  },

  findExchangeConnectionByIdAndUser: async (
    id: string,
    userId: string
  ): Promise<IExchangeConnection | null> => {
    return ExchangeConnection.findOne({ _id: id, userId });
  },

  findExchangeConnectionById: async (id: string): Promise<IExchangeConnection | null> => {
    return ExchangeConnection.findById(id);
  },

  /**
   * Connections that are due to sync (poll worker). Excludes auth-terminal states.
   */
  findExchangeConnectionsDueForPoll: async (limit: number): Promise<IExchangeConnection[]> => {
    const now = new Date();
    return ExchangeConnection.find({
      nextPollAt: { $lte: now },
      status: { $in: ['active', 'rate_limited', 'error'] },
    })
      .sort({ nextPollAt: 1 })
      .limit(limit);
  },

  /**
   * System/worker updates (no user scoping) — e.g. poller, admin jobs.
   */
  updateExchangeConnectionById: async (
    id: string,
    patch: Partial<Record<string, unknown>>
  ): Promise<IExchangeConnection | null> => {
    return ExchangeConnection.findByIdAndUpdate(
      id,
      { $set: patch },
      { new: true }
    ) as Promise<IExchangeConnection | null>;
  },

  createExchangeConnection: async (data: {
    userId: string;
    label?: string;
    maskedApiKey: string;
    encryptedSecretBlob: string;
    encryptionKeyId: string;
    secretVersion: number;
    pollingIntervalMs: number;
  }): Promise<IExchangeConnection> => {
    const now = new Date();
    const doc = new ExchangeConnection({
      userId: data.userId,
      provider: 'coindcx',
      label: data.label,
      maskedApiKey: data.maskedApiKey,
      encryptedSecretBlob: data.encryptedSecretBlob,
      encryptionKeyId: data.encryptionKeyId,
      secretVersion: data.secretVersion,
      status: 'active',
      syncPhase: 'initial_backfill',
      balancesFreshness: 'stale',
      tradesFreshness: 'stale',
      pollingIntervalMs: data.pollingIntervalMs,
      nextPollAt: now,
    });
    return doc.save();
  },

  updateExchangeConnection: async (
    id: string,
    userId: string,
    patch: Partial<{
      label: string;
      maskedApiKey: string;
      encryptedSecretBlob: string;
      encryptionKeyId: string;
      secretVersion: number;
      status: ExchangeConnectionStatus;
      syncPhase: IExchangeConnection['syncPhase'];
      lastErrorAt: Date;
      lastErrorCode: string;
      lastErrorMessage: string;
    }>
  ): Promise<IExchangeConnection | null> => {
    return ExchangeConnection.findOneAndUpdate(
      { _id: id, userId },
      { $set: patch },
      { new: true }
    );
  },

  deleteExchangeConnection: async (id: string, userId: string): Promise<boolean> => {
    const res = await ExchangeConnection.deleteOne({ _id: id, userId });
    return res.deletedCount > 0;
  },

  deleteEventsBySourceId: async (userId: string, sourceId: string): Promise<number> => {
    const r = await WalletEvent.deleteMany({ userId, sourceId, sourceType: 'exchange' });
    return r.deletedCount ?? 0;
  },
};
