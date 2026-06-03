import { RiskFactorRaw } from '../models/RiskFactorRaw';
import { RiskFactorBuildSummary } from '../models/RiskFactorBuildSummary';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(p * (sorted.length - 1));
  return sorted[idx];
}

/**
 * Nightly compaction: aggregate recent factor raws into per-build summaries, then purge hot raws > 30d.
 */
export async function compactRiskFactorRaws(): Promise<{ builds: number; purged: number }> {
  const cutoff = new Date(Date.now() - 30 * 24 * 3600_000);
  const buildIds = await RiskFactorRaw.distinct('buildId', { createdAt: { $gte: cutoff } });

  let builds = 0;
  for (const buildId of buildIds) {
    const factors = await RiskFactorRaw.distinct('factor', { buildId });
    for (const factor of factors) {
      const rows = await RiskFactorRaw.find({ buildId, factor }).select('raw').lean();
      if (!rows.length) continue;
      const values = rows.map((r) => r.raw).sort((a, b) => a - b);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
      await RiskFactorBuildSummary.updateOne(
        { buildId, factor },
        {
          $set: {
            buildId,
            factor,
            universeSize: rows.length,
            eligibleCount: rows.length,
            rawMean: mean,
            rawStd: Math.sqrt(variance),
            rawP50: percentile(values, 0.5),
            rawP95: percentile(values, 0.95),
            computedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }
    builds += 1;
  }

  const purgeResult = await RiskFactorRaw.deleteMany({ createdAt: { $lt: cutoff } });
  return { builds, purged: purgeResult.deletedCount ?? 0 };
}
