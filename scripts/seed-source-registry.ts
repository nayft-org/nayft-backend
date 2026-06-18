/**
 * seed-source-registry.ts
 *
 * Seeds source_registry with known publishers and source_aliases with
 * known variants. Safe to run multiple times (idempotent).
 *
 * Usage: npx ts-node scripts/seed-source-registry.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../src/config/env';
import { SourceRegistry, SourceAlias, toTrustCategory } from '../src/modules/news/models/SourceRegistry';
import { seedKnownAliases } from '../src/modules/news/services/sourceCanonicalizer.service';

interface SeedEntry {
  sourceKey: string;
  sourceName: string;
  sourceDomain: string;
  trustScore: number;
  status: 'approved' | 'pending';
}

const SEED_SOURCES: SeedEntry[] = [
  { sourceKey: 'coindesk', sourceName: 'CoinDesk', sourceDomain: 'coindesk.com', trustScore: 1.0, status: 'approved' },
  { sourceKey: 'reuters', sourceName: 'Reuters', sourceDomain: 'reuters.com', trustScore: 0.95, status: 'approved' },
  { sourceKey: 'bloomberg', sourceName: 'Bloomberg', sourceDomain: 'bloomberg.com', trustScore: 0.95, status: 'approved' },
  { sourceKey: 'the-block', sourceName: 'The Block', sourceDomain: 'theblock.co', trustScore: 0.85, status: 'approved' },
  { sourceKey: 'decrypt', sourceName: 'Decrypt', sourceDomain: 'decrypt.co', trustScore: 0.82, status: 'approved' },
  { sourceKey: 'cointelegraph', sourceName: 'CoinTelegraph', sourceDomain: 'cointelegraph.com', trustScore: 0.80, status: 'approved' },
  { sourceKey: 'cryptonews', sourceName: 'CryptoNews', sourceDomain: 'crypto.news', trustScore: 0.75, status: 'approved' },
  { sourceKey: 'nft-now', sourceName: 'NFT Now', sourceDomain: 'nftnow.com', trustScore: 0.72, status: 'approved' },
];

async function main(): Promise<void> {
  await mongoose.connect(config.mongoUri);
  console.info('[seed-source-registry] connected to MongoDB');

  let upserted = 0;
  for (const s of SEED_SOURCES) {
    const trustCategory = toTrustCategory(s.trustScore);
    const result = await SourceRegistry.updateOne(
      { sourceKey: s.sourceKey },
      {
        $setOnInsert: {
          sourceKey: s.sourceKey,
          sourceName: s.sourceName,
          sourceDomain: s.sourceDomain,
          status: s.status,
          trustScore: s.trustScore,
          trustCategory,
          isActive: s.status === 'approved',
          discoveredAt: new Date(),
          articleCount: 0,
        },
      },
      { upsert: true }
    );
    if (result.upsertedCount) upserted++;
  }

  await seedKnownAliases();

  console.info('[seed-source-registry] done', { upserted, total: SEED_SOURCES.length });
}

main()
  .catch((err) => {
    console.error('[seed-source-registry] failed', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
