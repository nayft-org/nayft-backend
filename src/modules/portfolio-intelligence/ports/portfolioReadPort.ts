import type { HoldingPositionFields } from '../../portfolio/models/Holding';
import type { IWalletAddress } from '../../portfolio/models/WalletAddress';
import type { IExchangeConnection } from '../../portfolio/models/ExchangeConnection';

/** Frozen port — portfolio-intelligence must not import portfolio repository directly. */
export interface IPortfolioReadPort {
  findWalletsByUser(userId: string): Promise<IWalletAddress[]>;
  findHoldingsByUser(userId: string): Promise<{
    totalValue: number;
    absoluteChange24h: number;
    relativeChange24h: number;
    positions: HoldingPositionFields[];
    syncedAt?: Date;
  } | null>;
  userHasPollableExchangeConnection(userId: string): Promise<boolean>;
  findExchangeConnectionsByUser(userId: string): Promise<IExchangeConnection[]>;
  upsertHoldings(
    userId: string,
    data: {
      totalValue: number;
      absoluteChange24h: number;
      relativeChange24h: number;
      positions: HoldingPositionFields[];
      ingestRevision?: number;
    }
  ): Promise<unknown>;
}
