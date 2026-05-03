function pickString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).length > 0) return String(v);
  }
  return undefined;
}

function pickNumber(row: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = parseFloat(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

export interface NormalizedCoindcxTrade {
  tradeId: string;
  symbol?: string;
  side?: string;
  quantity?: number;
  price?: number;
  fee?: number;
  feeCurrency?: string;
  /** ms epoch */
  timestampMs?: number;
  raw: Record<string, unknown>;
}

export function normalizeCoindcxTradeRow(row: Record<string, unknown>): NormalizedCoindcxTrade | null {
  const tradeId =
    pickString(row, ['id', 'trade_id', 'tradeId', 'fill_id', 'execution_id']) ?? '';
  if (!tradeId) return null;

  const ts =
    pickNumber(row, ['timestamp', 'time', 'created_at', 'trade_timestamp']) ??
    (typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : undefined);

  return {
    tradeId,
    symbol: pickString(row, ['symbol', 'market', 'pair']),
    side: pickString(row, ['side', 'order_side', 'taker_side']),
    quantity: pickNumber(row, ['quantity', 'qty', 'amount', 'filled_quantity']),
    price: pickNumber(row, ['price', 'trade_price', 'execution_price']),
    fee: pickNumber(row, ['fee_amount', 'fee', 'commission']),
    feeCurrency: pickString(row, ['fee_currency', 'feeCurrency', 'commission_asset']),
    timestampMs: ts != null && Number.isFinite(ts) ? (ts > 1e12 ? ts : ts * 1000) : undefined,
    raw: row,
  };
}
