import type { IWalletEvent } from '../modules/portfolio/models/WalletEvent';

/** Allowlisted wallet event shape for WS fanout (no raw enrichedData blobs). */
export interface WalletEventWsDto {
  id: string;
  address: string;
  chain: string;
  type: string;
  rawEventCount: number;
  transactionCount: number;
  eventSummaries: string[];
  aggregatedAt: string;
  activity?: {
    txHash?: string;
    txStatus?: string;
    explorerUrl?: string;
    asset?: string;
    value?: string | number;
  };
  enrichedSource?: string;
}

export function toWalletEventWsDto(event: IWalletEvent): WalletEventWsDto {
  const id =
    typeof event._id === 'string'
      ? event._id
      : (event._id as { toString(): string }).toString();
  const enriched = event.enrichedData as Record<string, unknown> | null | undefined;
  return {
    id,
    address: event.address,
    chain: event.chain,
    type: event.type,
    rawEventCount: event.rawEventCount ?? 0,
    transactionCount: event.transactionCount ?? 0,
    eventSummaries: event.eventSummaries ?? [],
    aggregatedAt:
      event.aggregatedAt instanceof Date
        ? event.aggregatedAt.toISOString()
        : String(event.aggregatedAt ?? ''),
    activity: event.activity
      ? {
          txHash: event.activity.txHash,
          txStatus: event.activity.txStatus ?? undefined,
          explorerUrl: event.activity.explorerUrl,
          asset: event.activity.asset,
          value: event.activity.value,
        }
      : undefined,
    enrichedSource: typeof enriched?.source === 'string' ? enriched.source : undefined,
  };
}
