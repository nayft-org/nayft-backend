import { RiskAlert } from '../models/RiskAlert';
import { RiskSnapshot } from '../models/RiskSnapshot';
import { riskMetrics } from '../../../observability/riskMetrics';

export async function emitRiskAlerts(
  revision: number,
  buildId: string,
  priorRevision: number
): Promise<void> {
  const [current, prior] = await Promise.all([
    RiskSnapshot.find({ revision }).lean(),
    priorRevision > 0
      ? RiskSnapshot.find({ revision: priorRevision }).lean()
      : Promise.resolve([]),
  ]);

  const priorBySymbol = new Map(prior.map((p) => [p.symbol, p]));

  for (const snap of current) {
    const prev = priorBySymbol.get(snap.symbol);
    if (!prev) continue;
    const delta = snap.crs - prev.crs;
    if (delta > 0.12) {
      const dedupeKey = `crs_jump:${snap.symbol}:${revision}`;
      const exists = await RiskAlert.findOne({ dedupeKey }).lean();
      if (exists) continue;
      await RiskAlert.create({
        symbol: snap.symbol,
        alertType: 'crs_jump',
        revision,
        buildId,
        severity: 'warning',
        message: `CRS jumped ${(delta * 100).toFixed(1)}% for ${snap.symbol}`,
        dedupeKey,
        payload: { delta, crs: snap.crs },
      });
      riskMetrics.alertsEmittedTotal += 1;
    }
  }
}
