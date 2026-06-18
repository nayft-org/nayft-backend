import { redis } from '../../../config/redis';
import { SourceRegistry } from '../models/SourceRegistry';
import { NewsArticle } from '../models/NewsArticle';
import { SourceRepairQueue } from '../models/SourceRepairQueue';

const HEALTH_CACHE_KEY = 'source:health:snapshot';
const HEALTH_CACHE_TTL_SEC = 300; // 5 min

export interface SourceBrandingHealth {
  totalSources: number;
  approvedSources: number;
  pendingSources: number;
  blockedSources: number;
  missingLogos: number;
  missingDomains: number;
  missingTrustProfiles: number;
  staleArticleBranding?: number;
  pendingRepairItems?: number;
  failedRepairItems?: number;
  computedAt: string;
}

export async function computeSourceBrandingHealth(forceRefresh = false): Promise<SourceBrandingHealth> {
  if (!forceRefresh) {
    try {
      const cached = await redis.get(HEALTH_CACHE_KEY);
      if (cached) return JSON.parse(cached) as SourceBrandingHealth;
    } catch {
      // compute below
    }
  }

  const [statusCounts, missingLogos, missingDomains, missingTrust, repairStats] = await Promise.all([
    (SourceRegistry as any).aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    SourceRegistry.countDocuments({
      sourceLogo: { $in: [null, undefined, ''] },
      status: { $ne: 'blocked' },
    }),
    SourceRegistry.countDocuments({
      $or: [{ sourceDomain: { $exists: false } }, { sourceDomain: '' }],
    }),
    SourceRegistry.countDocuments({
      $or: [
        { trustScore: { $exists: false } },
        { trustCategory: { $exists: false } },
        { trustScore: null },
        { trustCategory: null },
      ],
    }),
    Promise.all([
      SourceRepairQueue.countDocuments({ status: 'pending' }),
      SourceRepairQueue.countDocuments({ status: 'failed' }),
    ]),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of statusCounts as Array<{ _id: string; count: number }>) {
    byStatus[row._id] = row.count;
  }

  // Stale article branding: articles whose source.key isn't in registry
  let staleArticleBranding = 0;
  try {
    const registryKeys = await SourceRegistry.distinct('sourceKey');
    staleArticleBranding = await NewsArticle.countDocuments({
      status: 'active',
      'source.key': { $nin: registryKeys },
    });
  } catch {
    // non-fatal
  }

  const health: SourceBrandingHealth = {
    totalSources: Object.values(byStatus).reduce((a, b) => a + b, 0),
    approvedSources: byStatus['approved'] ?? 0,
    pendingSources: byStatus['pending'] ?? 0,
    blockedSources: byStatus['blocked'] ?? 0,
    missingLogos,
    missingDomains,
    missingTrustProfiles: missingTrust,
    staleArticleBranding,
    pendingRepairItems: repairStats[0],
    failedRepairItems: repairStats[1],
    computedAt: new Date().toISOString(),
  };

  try {
    await redis.setex(HEALTH_CACHE_KEY, HEALTH_CACHE_TTL_SEC, JSON.stringify(health));
  } catch {
    // non-fatal
  }

  return health;
}
