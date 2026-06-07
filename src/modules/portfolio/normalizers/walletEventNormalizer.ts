/** Strip provider enrichedData to allowlisted wallet event fields before persistence. */
export function normalizeEnrichedData(
  raw: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;

  const source = typeof raw.source === 'string' ? raw.source : 'unknown';

  if (source === 'coindcx' && raw.row && typeof raw.row === 'object') {
    const row = raw.row as Record<string, unknown>;
    return {
      source: 'coindcx',
      row: {
        side: row.side,
        price: row.price,
        amount: row.amount,
        symbol: row.symbol,
        type: row.type,
      },
    };
  }

  if (source === 'zerion') {
    const portfolio = raw.portfolio as Record<string, unknown> | undefined;
    const positions = Array.isArray(raw.positions) ? raw.positions : [];
    return {
      source: 'zerion',
      positionsCount: positions.length,
      totalValue: portfolio?.totalValue ?? null,
    };
  }

  if (source === 'alchemy') {
    const transfers = Array.isArray(raw.transfers) ? raw.transfers : [];
    return {
      source: 'alchemy',
      transferCount: transfers.length,
    };
  }

  const out: Record<string, unknown> = { source };
  const allow = ['side', 'price', 'amount', 'symbol', 'type'] as const;
  for (const key of allow) {
    if (raw[key] !== undefined) out[key] = raw[key];
  }
  return Object.keys(out).length > 1 ? out : null;
}
