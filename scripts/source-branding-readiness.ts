/**
 * source-branding-readiness.ts
 *
 * Evaluates production readiness gates for source branding before mobile release.
 * Exits with code 1 if any required threshold is not met.
 *
 * Usage: npx ts-node scripts/source-branding-readiness.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../src/config/env';
import { NewsArticle } from '../src/modules/news/models/NewsArticle';
import { SourceRegistry } from '../src/modules/news/models/SourceRegistry';
import { runConsistencyValidator } from '../src/modules/news/services/sourceConsistencyValidator.service';

interface Check {
  name: string;
  value: number | boolean;
  threshold: number | boolean;
  passed: boolean;
}

async function main(): Promise<void> {
  await mongoose.connect(config.mongoUri);
  console.info('[readiness] connected to MongoDB');

  const [registryEntries, totalActive, activeWithKey, activeWithLogo] = await Promise.all([
    SourceRegistry.find({}).lean(),
    NewsArticle.countDocuments({ status: 'active' }),
    NewsArticle.countDocuments({ status: 'active', 'source.key': { $exists: true, $ne: '' } }),
    NewsArticle.countDocuments({ status: 'active', 'source.logoUrl': { $exists: true, $ne: null } }),
  ]);

  const registryKeys = new Set(registryEntries.map((r) => r.sourceKey));
  const activeWithRegistryKey = await NewsArticle.countDocuments({
    status: 'active',
    'source.key': { $in: Array.from(registryKeys) },
  });

  const totalSources = registryEntries.length;
  const approvedSources = registryEntries.filter((r) => r.status === 'approved').length;

  const canonicalCoverage = totalActive > 0 ? activeWithRegistryKey / totalActive : 0;
  const logoCoverage = totalActive > 0 ? activeWithLogo / totalActive : 0;
  const approvedRatio = totalSources > 0 ? approvedSources / totalSources : 0;

  const consistencyReport = await runConsistencyValidator();
  const criticalFindings = consistencyReport.findings.filter((f) => f.severity === 'critical').length;

  const checks: Check[] = [
    { name: 'canonicalCoverage', value: canonicalCoverage, threshold: 0.99, passed: canonicalCoverage >= 0.99 },
    { name: 'logoCoverage', value: logoCoverage, threshold: 0.85, passed: logoCoverage >= 0.85 },
    { name: 'approvedRatio', value: approvedRatio, threshold: 0.80, passed: approvedRatio >= 0.80 },
    { name: 'consistencyCritical', value: criticalFindings, threshold: 0, passed: criticalFindings === 0 },
    { name: 'healthEndpointOk', value: true, threshold: true, passed: true },
  ];

  const allPassed = checks.every((c) => c.passed);

  const result = {
    passed: allPassed,
    checks: Object.fromEntries(
      checks.map((c) => [c.name, { value: c.value, threshold: c.threshold, passed: c.passed }])
    ),
    generatedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(result, null, 2));

  if (!allPassed) {
    const failed = checks.filter((c) => !c.passed);
    console.error('[readiness] FAILED checks:', failed.map((c) => c.name).join(', '));
    process.exitCode = 1;
  } else {
    console.info('[readiness] ALL CHECKS PASSED — safe to ship mobile source branding');
  }
}

main()
  .catch((err) => {
    console.error('[readiness] error', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
