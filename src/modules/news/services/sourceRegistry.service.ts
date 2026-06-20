import { SourceRegistry, toTrustCategory, type ISourceRegistry } from '../models/SourceRegistry';
import { recordSourceAudit } from '../models/SourceAuditLog';
import { invalidateLogoCache } from './sourceLogoResolver.service';
import { bumpNewsFeedRevision } from '../newsFeedRevision';
import { NewsArticle } from '../models/NewsArticle';
import type { SourceStatus } from '../models/SourceRegistry';
import { recordAdminAudit } from '../../../core/admin/adminAudit.service';

/**
 * Resolve full registry entry for a sourceKey. Returns null if not found.
 */
export async function getRegistryEntry(sourceKey: string): Promise<ISourceRegistry | null> {
  return SourceRegistry.findOne({ sourceKey }).lean<ISourceRegistry>();
}

/**
 * Approve a publisher: set status to approved, assign trust if provided, record audit.
 */
export async function approveSource(
  sourceKey: string,
  opts: { trustScore?: number; actorId?: string }
): Promise<void> {
  const entry = await SourceRegistry.findOne({ sourceKey });
  if (!entry) throw new Error(`Source not found: ${sourceKey}`);

  const trustScore = opts.trustScore ?? 0.75;
  const trustCategory = toTrustCategory(trustScore);

  const prev = { status: entry.status, trustScore: entry.trustScore };

  await SourceRegistry.updateOne(
    { sourceKey },
    {
      $set: {
        status: 'approved',
        isActive: true,
        trustScore,
        trustCategory,
        reviewedAt: new Date(),
        reviewedBy: opts.actorId,
      },
    }
  );

  await recordSourceAudit({
    sourceKey,
    action: 'publisher_approved',
    previousValue: prev,
    newValue: { status: 'approved', trustScore, trustCategory },
    actorId: opts.actorId,
    actorType: 'admin',
  });

  if (opts.actorId) {
    await recordAdminAudit({
      actorId: opts.actorId,
      action: 'source:approve',
      target: sourceKey,
      diff: { trustScore, trustCategory },
    });
  }

  await denormSourceBranding(sourceKey);
}

/**
 * Block a publisher: set status blocked, zero trust, record audit.
 */
export async function blockSource(
  sourceKey: string,
  opts: { actorId?: string }
): Promise<void> {
  const entry = await SourceRegistry.findOne({ sourceKey });
  if (!entry) throw new Error(`Source not found: ${sourceKey}`);

  const prev = { status: entry.status };

  await SourceRegistry.updateOne(
    { sourceKey },
    {
      $set: {
        status: 'blocked',
        isActive: false,
        trustScore: 0,
        trustCategory: 'unknown',
        reviewedAt: new Date(),
        reviewedBy: opts.actorId,
      },
    }
  );

  await recordSourceAudit({
    sourceKey,
    action: 'publisher_blocked',
    previousValue: prev,
    newValue: { status: 'blocked' },
    actorId: opts.actorId,
    actorType: 'admin',
  });

  if (opts.actorId) {
    await recordAdminAudit({
      actorId: opts.actorId,
      action: 'source:block',
      target: sourceKey,
      diff: { status: 'blocked' },
    });
  }
}

/**
 * Update the logo URL on a registry entry and propagate to articles.
 */
export async function updateSourceLogo(
  sourceKey: string,
  logoUrl: string,
  opts: { actorId?: string; logoSource?: 'manual' | 'favicon' | 'upload' }
): Promise<void> {
  const entry = await SourceRegistry.findOne({ sourceKey });
  if (!entry) throw new Error(`Source not found: ${sourceKey}`);

  const prev = entry.sourceLogo;

  await SourceRegistry.updateOne(
    { sourceKey },
    {
      $set: {
        sourceLogo: logoUrl,
        logoSource: opts.logoSource ?? 'manual',
        logoFetchedAt: new Date(),
      },
    }
  );

  await invalidateLogoCache(sourceKey);

  await recordSourceAudit({
    sourceKey,
    action: 'logo_changed',
    previousValue: prev,
    newValue: logoUrl,
    actorId: opts.actorId,
    actorType: opts.actorId ? 'admin' : 'repair_job',
  });

  await denormSourceBranding(sourceKey);
}

/**
 * Update trust score and category, propagate to articles, bump feed revision.
 */
export async function updateSourceTrust(
  sourceKey: string,
  trustScore: number,
  opts: { actorId?: string }
): Promise<void> {
  const entry = await SourceRegistry.findOne({ sourceKey });
  if (!entry) throw new Error(`Source not found: ${sourceKey}`);

  const trustCategory = toTrustCategory(trustScore);
  const prev = { trustScore: entry.trustScore, trustCategory: entry.trustCategory };

  await SourceRegistry.updateOne({ sourceKey }, { $set: { trustScore, trustCategory } });

  await recordSourceAudit({
    sourceKey,
    action: 'trust_changed',
    previousValue: prev,
    newValue: { trustScore, trustCategory },
    actorId: opts.actorId,
    actorType: opts.actorId ? 'admin' : 'system',
  });

  await denormSourceBranding(sourceKey);
}

/**
 * Denormalize branding fields from source_registry onto all articles with matching source.key.
 * Bumps the feed revision so caches are invalidated.
 */
export async function denormSourceBranding(sourceKey: string): Promise<void> {
  const entry = await SourceRegistry.findOne({ sourceKey }).lean<ISourceRegistry>();
  if (!entry) return;

  await NewsArticle.updateMany(
    { 'source.key': sourceKey },
    {
      $set: {
        'source.name': entry.sourceName,
        'source.domain': entry.sourceDomain,
        'source.logoUrl': entry.sourceLogo ?? null,
        'source.trustCategory': entry.trustCategory,
      },
    }
  );

  await bumpNewsFeedRevision();
}

/**
 * List sources for admin review queue.
 */
export async function listSources(opts: {
  status?: SourceStatus;
  limit?: number;
  skip?: number;
}): Promise<ISourceRegistry[]> {
  const query: Record<string, unknown> = {};
  if (opts.status) query.status = opts.status;

  return SourceRegistry.find(query)
    .sort({ articleCount: -1, discoveredAt: -1 })
    .skip(opts.skip ?? 0)
    .limit(opts.limit ?? 50)
    .lean<ISourceRegistry[]>();
}

/**
 * Refresh article counts for all registry entries.
 * Run nightly.
 */
export async function refreshArticleCounts(): Promise<void> {
  const rows = await (NewsArticle as any).aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: '$source.key', count: { $sum: 1 } } },
  ]);

  const ops = rows.map((r: { _id: string; count: number }) => ({
    updateOne: {
      filter: { sourceKey: r._id },
      update: { $set: { articleCount: r.count } },
    },
  }));

  if (ops.length > 0) {
    await SourceRegistry.bulkWrite(ops, { ordered: false });
  }
}
