import type { NormalizedPosition } from '../../contracts/piContracts';

function concentrationLevel(topPct: number): string {
  if (topPct >= 65) return 'Extreme';
  if (topPct >= 45) return 'High';
  if (topPct >= 30) return 'Moderate';
  return 'Low';
}

export function runConcentration(positions: NormalizedPosition[]) {
  if (positions.length === 0) {
    return {
      topHolding: '',
      topHoldingPct: 0,
      top3Pct: 0,
      concentrationLevel: 'Low',
      hhi: 0,
    };
  }

  const sorted = [...positions].sort((a, b) => {
    if (b.weightPct !== a.weightPct) return b.weightPct - a.weightPct;
    return a.symbol.localeCompare(b.symbol);
  });

  const topHoldingPct = Math.round(sorted[0].weightPct * 1000) / 10;
  const top3Pct = Math.round(sorted.slice(0, 3).reduce((s, p) => s + p.weightPct, 0) * 1000) / 10;
  const hhi = Math.round(sorted.reduce((s, p) => s + p.weightPct * p.weightPct, 0) * 10000) / 10000;

  return {
    topHolding: sorted[0].symbol,
    topHoldingPct,
    top3Pct,
    concentrationLevel: concentrationLevel(topHoldingPct),
    hhi,
  };
}
