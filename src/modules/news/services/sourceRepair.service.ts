import { SourceRegistry } from '../models/SourceRegistry';
import { SourceRepairQueue, type RepairType } from '../models/SourceRepairQueue';
import { recordSourceAudit } from '../models/SourceAuditLog';
import { fetchAndStoreLogo } from './sourceLogoResolver.service';
import { denormSourceBranding } from './sourceRegistry.service';
import { addAlias, extractDomain } from './sourceCanonicalizer.service';
import { defaultTrustForStatus } from '../models/SourceRegistry';
import { NewsArticle } from '../models/NewsArticle';

const MAX_ATTEMPTS = 4;

/** Exponential backoff with jitter: 1h * 2^attempts + random(0..15m), capped at 7d */
function nextRetryAt(attempts: number): Date {
  const baseMs = 60 * 60 * 1_000; // 1 hour
  const capMs = 7 * 24 * 60 * 60 * 1_000;
  const jitterMs = Math.random() * 15 * 60 * 1_000;
  const delayMs = Math.min(baseMs * Math.pow(2, attempts), capMs) + jitterMs;
  return new Date(Date.now() + delayMs);
}

async function repairLogo(sourceKey: string): Promise<boolean> {
  const logoUrl = await fetchAndStoreLogo(sourceKey);
  if (logoUrl) {
    await denormSourceBranding(sourceKey);
    return true;
  }
  return false;
}

async function repairDomain(sourceKey: string): Promise<boolean> {
  const entry = await SourceRegistry.findOne({ sourceKey }).lean();
  if (!entry) return false;
  if (entry.sourceDomain) return true; // already has domain

  // Sample a source URL from articles
  const article = await NewsArticle.findOne({ 'source.key': sourceKey }, { sourceUrl: 1 }).lean();
  if (!article?.sourceUrl) return false;

  const domain = extractDomain(article.sourceUrl);
  if (!domain) return false;

  await SourceRegistry.updateOne({ sourceKey }, { $set: { sourceDomain: domain } });
  await addAlias(domain, sourceKey, 'domain');
  await recordSourceAudit({ sourceKey, action: 'domain_changed', newValue: domain, actorType: 'repair_job' });
  await denormSourceBranding(sourceKey);
  return true;
}

async function repairTrust(sourceKey: string): Promise<boolean> {
  const entry = await SourceRegistry.findOne({ sourceKey }).lean();
  if (!entry) return false;
  if (entry.trustScore != null && entry.trustCategory) return true;

  const defaults = defaultTrustForStatus(entry.status);
  await SourceRegistry.updateOne({ sourceKey }, { $set: defaults });
  await recordSourceAudit({
    sourceKey,
    action: 'trust_assigned_default',
    newValue: defaults,
    actorType: 'repair_job',
  });
  return true;
}

async function repairDenorm(sourceKey: string): Promise<boolean> {
  await denormSourceBranding(sourceKey);
  return true;
}

/**
 * Process a single repair queue item.
 */
async function processRepairItem(repairType: RepairType, sourceKey: string): Promise<boolean> {
  switch (repairType) {
    case 'logo': return repairLogo(sourceKey);
    case 'domain': return repairDomain(sourceKey);
    case 'trust': return repairTrust(sourceKey);
    case 'denorm': return repairDenorm(sourceKey);
    default: return false;
  }
}

/**
 * Run a batch of repair queue items.
 * @param repairType - type to process; undefined = all types
 * @param batchSize - max items to process
 */
export async function runRepairBatch(repairType?: RepairType, batchSize = 50): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const now = new Date();
  const query: Record<string, unknown> = {
    status: 'pending',
    attempts: { $lt: MAX_ATTEMPTS },
    $or: [{ nextRetryAt: { $exists: false } }, { nextRetryAt: { $lte: now } }],
  };
  if (repairType) query.repairType = repairType;

  const items = await SourceRepairQueue.find(query)
    .sort({ attempts: 1 })
    .limit(batchSize)
    .lean();

  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    await SourceRepairQueue.updateOne({ _id: item._id }, { $set: { status: 'processing', lastAttemptAt: now } });

    try {
      const ok = await processRepairItem(item.repairType as RepairType, item.sourceKey);
      if (ok) {
        await SourceRepairQueue.updateOne({ _id: item._id }, { $set: { status: 'done' } });
        succeeded++;
      } else {
        const nextAttempts = item.attempts + 1;
        const newStatus = nextAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
        await SourceRepairQueue.updateOne(
          { _id: item._id },
          { $set: { status: newStatus, attempts: nextAttempts, nextRetryAt: nextRetryAt(nextAttempts) } }
        );
        failed++;
      }
    } catch (err: any) {
      const nextAttempts = item.attempts + 1;
      const newStatus = nextAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      await SourceRepairQueue.updateOne(
        { _id: item._id },
        {
          $set: {
            status: newStatus,
            attempts: nextAttempts,
            nextRetryAt: nextRetryAt(nextAttempts),
            lastError: (err?.message || String(err)).slice(0, 300),
          },
        }
      );
      failed++;
    }
  }

  return { processed: items.length, succeeded, failed };
}

/**
 * Enqueue missing-logo repair jobs for sources with no logo but with a domain.
 */
export async function enqueueMissingLogoRepairs(limit = 50): Promise<number> {
  const sources = await SourceRegistry.find(
    {
      sourceLogo: { $in: [null, undefined, ''] },
      sourceDomain: { $exists: true, $ne: '' },
      status: { $ne: 'blocked' },
      articleCount: { $gte: 1 },
    },
    { sourceKey: 1 }
  )
    .sort({ articleCount: -1 })
    .limit(limit)
    .lean();

  let enqueued = 0;
  for (const s of sources) {
    try {
      await SourceRepairQueue.updateOne(
        { sourceKey: s.sourceKey, repairType: 'logo', status: { $in: ['done', 'failed'] } },
        { $set: { status: 'pending', attempts: 0, nextRetryAt: new Date() } }
      );
      await SourceRepairQueue.updateOne(
        { sourceKey: s.sourceKey, repairType: 'logo' },
        { $setOnInsert: { sourceKey: s.sourceKey, repairType: 'logo', attempts: 0, status: 'pending' } },
        { upsert: true }
      );
      enqueued++;
    } catch {
      // E11000 ok
    }
  }
  return enqueued;
}

/**
 * Enqueue missing-domain repair jobs.
 */
export async function enqueueMissingDomainRepairs(): Promise<number> {
  const sources = await SourceRegistry.find(
    { $or: [{ sourceDomain: { $exists: false } }, { sourceDomain: '' }] },
    { sourceKey: 1 }
  ).lean();

  let enqueued = 0;
  for (const s of sources) {
    try {
      await SourceRepairQueue.updateOne(
        { sourceKey: s.sourceKey, repairType: 'domain' },
        { $setOnInsert: { sourceKey: s.sourceKey, repairType: 'domain', attempts: 0, status: 'pending' } },
        { upsert: true }
      );
      enqueued++;
    } catch {
      // E11000 ok
    }
  }
  return enqueued;
}

/**
 * Enqueue missing-trust repair jobs.
 */
export async function enqueueMissingTrustRepairs(): Promise<number> {
  const sources = await SourceRegistry.find(
    { $or: [{ trustScore: { $exists: false } }, { trustCategory: { $exists: false } }] },
    { sourceKey: 1 }
  ).lean();

  let enqueued = 0;
  for (const s of sources) {
    try {
      await SourceRepairQueue.updateOne(
        { sourceKey: s.sourceKey, repairType: 'trust' },
        { $setOnInsert: { sourceKey: s.sourceKey, repairType: 'trust', attempts: 0, status: 'pending' } },
        { upsert: true }
      );
      enqueued++;
    } catch {
      // E11000 ok
    }
  }
  return enqueued;
}
