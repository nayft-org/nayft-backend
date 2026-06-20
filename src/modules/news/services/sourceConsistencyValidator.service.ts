import mongoose from 'mongoose';
import { SourceRegistry, SourceAlias } from '../models/SourceRegistry';
import { NewsArticle } from '../models/NewsArticle';

export type FindingSeverity = 'critical' | 'warning' | 'info';

export interface ConsistencyFinding {
  check: string;
  severity: FindingSeverity;
  count: number;
  details?: unknown[];
}

export interface ConsistencyReport {
  reportId: string;
  generatedAt: string;
  findings: ConsistencyFinding[];
  autoRepaired: string[];
  needsManual: string[];
}

const ConsistencyReportCollection = mongoose.model(
  'SourceConsistencyReport',
  new mongoose.Schema(
    {
      reportId: { type: String, required: true, unique: true },
      generatedAt: { type: Date },
      findings: { type: mongoose.Schema.Types.Mixed },
      autoRepaired: [String],
      needsManual: [String],
    },
    {
      collection: 'source_consistency_reports',
      timestamps: false,
    }
  )
);

// 30-day TTL
ConsistencyReportCollection.schema.index({ generatedAt: 1 }, { expireAfterSeconds: 2_592_000 });

export async function runConsistencyValidator(): Promise<ConsistencyReport> {
  const reportId = `report-${Date.now()}`;
  const findings: ConsistencyFinding[] = [];
  const autoRepaired: string[] = [];
  const needsManual: string[] = [];

  // Check 1: orphan aliases (aliasKey points to sourceKey not in registry)
  const orphanAliases = await (SourceAlias as any).aggregate([
    {
      $lookup: {
        from: 'source_registry',
        localField: 'sourceKey',
        foreignField: 'sourceKey',
        as: 'reg',
      },
    },
    { $match: { reg: { $size: 0 } } },
    { $project: { aliasKey: 1, sourceKey: 1 } },
    { $limit: 100 },
  ]);

  if (orphanAliases.length > 0) {
    findings.push({
      check: 'orphan_aliases',
      severity: 'critical',
      count: orphanAliases.length,
      details: orphanAliases,
    });
    needsManual.push('orphan_aliases');
  }

  // Check 2: duplicate domains among approved sources
  const dupDomains = await (SourceRegistry as any).aggregate([
    { $match: { status: 'approved', sourceDomain: { $ne: '' } } },
    { $group: { _id: '$sourceDomain', count: { $sum: 1 }, keys: { $push: '$sourceKey' } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  if (dupDomains.length > 0) {
    findings.push({
      check: 'duplicate_domains_approved',
      severity: 'critical',
      count: dupDomains.length,
      details: dupDomains,
    });
    needsManual.push('duplicate_domains_approved');
  }

  // Check 3: articles referencing sourceKeys not in registry
  const registryKeys = await SourceRegistry.distinct('sourceKey');
  const orphanArticleCount = await NewsArticle.countDocuments({
    status: 'active',
    'source.key': { $nin: registryKeys },
  });

  if (orphanArticleCount > 0) {
    findings.push({
      check: 'articles_missing_publisher',
      severity: 'warning',
      count: orphanArticleCount,
    });
    needsManual.push('articles_missing_publisher');
  }

  // Check 4: blocked sources with active articles
  const blockedKeys = await SourceRegistry.distinct('sourceKey', { status: 'blocked' });
  if (blockedKeys.length > 0) {
    const blockedWithArticles = await NewsArticle.countDocuments({
      status: 'active',
      'source.key': { $in: blockedKeys },
    });
    if (blockedWithArticles > 0) {
      findings.push({
        check: 'blocked_source_with_active_articles',
        severity: 'warning',
        count: blockedWithArticles,
      });
      needsManual.push('blocked_source_with_active_articles');
    }
  }

  // Check 5: approved sources with zero articles for >30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);
  const emptyApproved = await SourceRegistry.countDocuments({
    status: 'approved',
    $or: [{ articleCount: 0 }, { articleCount: { $exists: false } }],
    discoveredAt: { $lt: thirtyDaysAgo },
  });

  if (emptyApproved > 0) {
    findings.push({ check: 'approved_zero_articles_30d', severity: 'info', count: emptyApproved });
  }

  const report: ConsistencyReport = {
    reportId,
    generatedAt: new Date().toISOString(),
    findings,
    autoRepaired,
    needsManual,
  };

  // Persist report
  try {
    await ConsistencyReportCollection.create({
      reportId,
      generatedAt: new Date(),
      findings,
      autoRepaired,
      needsManual,
    });
  } catch (err) {
    console.error('[sourceConsistency] failed to persist report', err);
  }

  // Alert on critical findings
  const criticals = findings.filter((f) => f.severity === 'critical');
  if (criticals.length > 0) {
    console.error('[sourceConsistency] CRITICAL findings', criticals);
  }

  console.info('[sourceConsistency] report', {
    reportId,
    findings: findings.length,
    critical: criticals.length,
    needsManual: needsManual.length,
  });

  return report;
}
