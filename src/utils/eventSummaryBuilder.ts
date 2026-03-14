import { WalletEventType } from '../modules/portfolio/models/WalletEvent';

/** Map MATIC to POL for display (Polygon rebrand) */
function mapAsset(asset: string): string {
  return asset.trim().toUpperCase() === 'MATIC' ? 'POL' : asset.trim();
}

/** Minimal event shape for summary building (avoids circular dep with aggregator) */
export interface EventSummaryInput {
  txHash:   string;
  type:     WalletEventType;
  activity?: { asset?: string; value?: number; fromAddress?: string; toAddress?: string };
}

function formatValue(value: number | undefined): string {
  if (value == null || isNaN(value)) return '';
  if (value >= 1e9) return value.toFixed(2);
  if (value >= 1e6) return value.toFixed(2);
  if (value >= 1e3) return value.toFixed(2);
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.01) return value.toFixed(4);
  if (value > 0) return value.toFixed(6);
  return '';
}

function formatSingleEvent(event: EventSummaryInput): string {
  const type = event.type;
  const rawAsset = event.activity?.asset?.trim() || '';
  const asset = mapAsset(rawAsset || '');
  const value = event.activity?.value;

  if (type === 'native_transfer') {
    const valStr = formatValue(value);
    return valStr && asset
      ? `native transfer ${valStr} ${asset}`
      : asset
        ? `native transfer ${asset}`
        : 'native transfer';
  }

  if (type === 'token_transfer') {
    const valStr = formatValue(value);
    return valStr && asset
      ? `transfer ${valStr} ${asset}`
      : asset
        ? `transfer ${asset}`
        : 'transfer';
  }

  if (type === 'contract_interaction') {
    return asset ? `trade ${asset}` : 'contract interaction';
  }

  return asset ? `transfer ${asset}` : 'contract interaction';
}

/**
 * Returns the number of unique transactions in the event batch.
 */
export function getTransactionCount(events: EventSummaryInput[]): number {
  const hashes = events.map((e) => e.txHash?.trim()).filter(Boolean);
  return new Set(hashes).size;
}

/**
 * Builds human-readable event summaries from buffered events.
 * Groups by txHash to detect swaps (sent + received with different assets).
 */
export function buildEventSummaries(
  events: EventSummaryInput[],
  monitoredAddress: string
): string[] {
  const summaries: string[] = [];
  const addr = monitoredAddress.toLowerCase();

  // Group events by txHash
  const byTx = new Map<string, EventSummaryInput[]>();
  for (const e of events) {
    const h = e.txHash?.trim() || '';
    if (!byTx.has(h)) byTx.set(h, []);
    byTx.get(h)!.push(e);
  }

  for (const txEvents of byTx.values()) {
    if (txEvents.length === 0) continue;

    const sent = txEvents.filter(
      (e) => e.activity?.fromAddress?.toLowerCase() === addr
    );
    const received = txEvents.filter(
      (e) => e.activity?.toAddress?.toLowerCase() === addr
    );

    const sentAssets = [...new Set(sent.map((e) => mapAsset(e.activity?.asset || '')).filter(Boolean))];
    const receivedAssets = [...new Set(received.map((e) => mapAsset(e.activity?.asset || '')).filter(Boolean))];

    const hasSwap =
      sent.length > 0 &&
      received.length > 0 &&
      sentAssets.length > 0 &&
      receivedAssets.length > 0 &&
      (sentAssets.length > 1 || receivedAssets.length > 1 || sentAssets[0] !== receivedAssets[0]);

    if (hasSwap && sentAssets[0] && receivedAssets[0]) {
      summaries.push(`swap ${sentAssets[0]} -> ${receivedAssets[0]}`);
    } else {
      for (const e of txEvents) {
        summaries.push(formatSingleEvent(e));
      }
    }
  }

  return summaries;
}
