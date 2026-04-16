#!/usr/bin/env npx ts-node
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import mongoose, { AnyBulkWriteOperation } from 'mongoose';
import { randomUUID } from 'crypto';
import { config } from '../src/config/env';

type PhaseKey =
  | 'coin_registry'
  | 'coingecko_coin_mappings'
  | 'cmc_coin_mappings'
  | 'coin_market_snapshots'
  | 'exchange_listed_assets'
  | 'exchange_asset_ingest_raw'
  | 'coin_news_tagging_map'
  | 'market_ohlcv_candles'
  | 'exchange_trade_ticks';

type Checkpoint = {
  completedPhases: PhaseKey[];
  updatedAt: string;
};

const CHECKPOINT_PATH = path.resolve(__dirname, '.coin-domain-migration-checkpoint.json');
const BATCH_SIZE = 1000;

const LEGACY_TO_TARGET: Record<PhaseKey, { legacy: string; target: string }> = {
  coin_registry: { legacy: 'coins', target: 'coin_registry' },
  coingecko_coin_mappings: { legacy: 'labeled_coins', target: 'coingecko_coin_mappings' },
  cmc_coin_mappings: { legacy: 'cmc_labeled_coins', target: 'cmc_coin_mappings' },
  coin_market_snapshots: { legacy: 'labeled_active_coins', target: 'coin_market_snapshots' },
  exchange_listed_assets: { legacy: 'filtered_coins', target: 'exchange_listed_assets' },
  exchange_asset_ingest_raw: { legacy: 'coin_raw_data', target: 'exchange_asset_ingest_raw' },
  coin_news_tagging_map: { legacy: 'coinmasters', target: 'coin_news_tagging_map' },
  market_ohlcv_candles: { legacy: 'ohlcv_klines', target: 'market_ohlcv_candles' },
  exchange_trade_ticks: { legacy: 'market_trades', target: 'exchange_trade_ticks' },
};

function readCheckpoint(): Checkpoint {
  if (!fs.existsSync(CHECKPOINT_PATH)) {
    return { completedPhases: [], updatedAt: new Date(0).toISOString() };
  }
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8')) as Checkpoint;
  } catch {
    return { completedPhases: [], updatedAt: new Date(0).toISOString() };
  }
}

function writeCheckpoint(checkpoint: Checkpoint): void {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2), 'utf8');
}

async function collectionExists(name: string): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');
  const docs = await db.listCollections({ name }).toArray();
  return docs.length > 0;
}

async function fetchInternalCoinMaps(): Promise<{
  byCoinId: Map<string, string>;
  bySymbol: Map<string, string>;
}> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');
  const rows = await db
    .collection(LEGACY_TO_TARGET.coin_registry.target)
    .find({}, { projection: { internalCoinId: 1, coinId: 1, symbol: 1 } })
    .toArray();
  const byCoinId = new Map<string, string>();
  const bySymbol = new Map<string, string>();
  for (const row of rows) {
    const internalCoinId = String(row.internalCoinId ?? '').trim();
    if (!internalCoinId) continue;
    const coinId = String(row.coinId ?? '').trim();
    const symbol = String(row.symbol ?? '').trim().toUpperCase();
    if (coinId) byCoinId.set(coinId, internalCoinId);
    if (symbol) bySymbol.set(symbol, internalCoinId);
  }
  return { byCoinId, bySymbol };
}

function mapInternalCoinId(
  doc: Record<string, unknown>,
  maps: { byCoinId: Map<string, string>; bySymbol: Map<string, string> }
): string | undefined {
  const coinId = String(doc.coinId ?? doc.id ?? '').trim();
  const symbol = String(doc.symbol ?? doc.base_asset ?? '').trim().toUpperCase();
  return maps.byCoinId.get(coinId) ?? maps.bySymbol.get(symbol);
}

async function migrateCoinRegistry(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');
  const { legacy, target } = LEGACY_TO_TARGET.coin_registry;
  if (!(await collectionExists(legacy))) {
    console.log(`[migrate] skip ${legacy}; collection does not exist`);
    return;
  }

  const source = db.collection(legacy);
  const dest = db.collection(target);
  const cursor = source.find({});
  let ops: AnyBulkWriteOperation[] = [];
  let count = 0;

  for await (const row of cursor) {
    const coinId = String(row.coinId ?? '').trim();
    if (!coinId) continue;
    const internalCoinId = String(row.internalCoinId ?? '').trim() || randomUUID();
    const next = {
      ...row,
      internalCoinId,
      migratedAt: new Date(),
      migrationVersion: 'coin-domain-v1',
    };
    delete (next as any)._id;
    ops.push({
      updateOne: {
        filter: { coinId },
        update: { $set: next },
        upsert: true,
      },
    });
    if (ops.length >= BATCH_SIZE) {
      await dest.bulkWrite(ops, { ordered: false });
      count += ops.length;
      ops = [];
    }
  }
  if (ops.length) {
    await dest.bulkWrite(ops, { ordered: false });
    count += ops.length;
  }
  console.log(`[migrate] coin_registry upserts=${count}`);
}

async function genericUpsertMigration(
  phase: Exclude<PhaseKey, 'coin_registry'>,
  makeFilter: (doc: Record<string, unknown>) => Record<string, unknown>,
  transform: (
    doc: Record<string, unknown>,
    maps: { byCoinId: Map<string, string>; bySymbol: Map<string, string> }
  ) => Record<string, unknown>,
  unresolvedCollector: Array<Record<string, unknown>>
): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');
  const { legacy, target } = LEGACY_TO_TARGET[phase];
  if (!(await collectionExists(legacy))) {
    console.log(`[migrate] skip ${legacy}; collection does not exist`);
    return;
  }

  const source = db.collection(legacy);
  const dest = db.collection(target);
  const maps = await fetchInternalCoinMaps();
  const cursor = source.find({});
  let ops: AnyBulkWriteOperation[] = [];
  let count = 0;

  for await (const row of cursor) {
    const doc = transform(row as Record<string, unknown>, maps);
    if (!doc.internalCoinId) {
      unresolvedCollector.push({
        inputToken: String(doc.id ?? doc.coinId ?? doc.symbol ?? ''),
        normalizedToken: String(doc.id ?? doc.coinId ?? doc.symbol ?? '').trim().toLowerCase(),
        evidence: { phase, legacy, target, symbol: doc.symbol, coinId: doc.coinId, id: doc.id },
        candidates: [],
        confidence: 0,
        status: 'pending',
        firstSeenAt: new Date(),
        lastTriedAt: new Date(),
        retryCount: 1,
      });
    }
    ops.push({
      updateOne: {
        filter: makeFilter(doc),
        update: { $set: doc },
        upsert: true,
      },
    });
    if (ops.length >= BATCH_SIZE) {
      await dest.bulkWrite(ops, { ordered: false });
      count += ops.length;
      ops = [];
    }
  }
  if (ops.length) {
    await dest.bulkWrite(ops, { ordered: false });
    count += ops.length;
  }
  console.log(`[migrate] ${target} upserts=${count}`);
}

async function writeUnresolvedQueue(rows: Array<Record<string, unknown>>): Promise<void> {
  if (!rows.length) return;
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');
  const coll = db.collection('coin_identity_resolution_queue');
  const ops = rows.map((row) => ({
    updateOne: {
      filter: {
        normalizedToken: row.normalizedToken,
        status: { $in: ['pending', 'retrying', 'manual_review'] },
      },
      update: {
        $setOnInsert: {
          inputToken: row.inputToken,
          normalizedToken: row.normalizedToken,
          firstSeenAt: row.firstSeenAt,
        },
        $set: {
          evidence: row.evidence,
          lastTriedAt: row.lastTriedAt,
          status: row.status,
          confidence: row.confidence,
        },
        $inc: { retryCount: 1 },
      },
      upsert: true,
    },
  }));
  await coll.bulkWrite(ops, { ordered: false });
  console.log(`[migrate] unresolved queue upserts=${rows.length}`);
}

async function migrateTimeSeriesWithMerge(
  phase: 'market_ohlcv_candles' | 'exchange_trade_ticks'
): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');
  const { legacy, target } = LEGACY_TO_TARGET[phase];
  if (!(await collectionExists(legacy))) {
    console.log(`[migrate] skip ${legacy}; collection does not exist`);
    return;
  }

  const now = new Date();
  await db.collection(legacy).aggregate(
    [
      {
        $set: {
          migratedAt: now,
          migrationVersion: 'coin-domain-v1',
        },
      },
      {
        $merge: {
          into: target,
          whenMatched: 'merge',
          whenNotMatched: 'insert',
        },
      },
    ],
    { allowDiskUse: true }
  ).toArray();

  const count = await db.collection(target).countDocuments();
  console.log(`[migrate] ${target} merged count=${count}`);
}

async function run(): Promise<void> {
  await mongoose.connect(config.mongoUri);
  const checkpoint = readCheckpoint();
  const unresolvedQueueRows: Array<Record<string, unknown>> = [];

  const runPhase = async (phase: PhaseKey, fn: () => Promise<void>) => {
    if (checkpoint.completedPhases.includes(phase)) {
      console.log(`[migrate] skip phase ${phase}; already completed`);
      return;
    }
    console.log(`[migrate] phase start ${phase}`);
    await fn();
    checkpoint.completedPhases.push(phase);
    checkpoint.updatedAt = new Date().toISOString();
    writeCheckpoint(checkpoint);
    console.log(`[migrate] phase complete ${phase}`);
  };

  await runPhase('coin_registry', migrateCoinRegistry);

  await runPhase('coingecko_coin_mappings', async () => {
    await genericUpsertMigration(
      'coingecko_coin_mappings',
      (doc) => ({ id: doc.id }),
      (doc, maps) => {
        const mapped = {
          ...doc,
          internalCoinId: mapInternalCoinId(doc, maps),
          migratedAt: new Date(),
          migrationVersion: 'coin-domain-v1',
        };
        delete (mapped as any)._id;
        return mapped;
      },
      unresolvedQueueRows
    );
  });

  await runPhase('cmc_coin_mappings', async () => {
    await genericUpsertMigration(
      'cmc_coin_mappings',
      (doc) => ({ id: doc.id }),
      (doc, maps) => {
        const mapped = {
          ...doc,
          internalCoinId: mapInternalCoinId(doc, maps),
          migratedAt: new Date(),
          migrationVersion: 'coin-domain-v1',
        };
        delete (mapped as any)._id;
        return mapped;
      },
      unresolvedQueueRows
    );
  });

  await runPhase('coin_market_snapshots', async () => {
    await genericUpsertMigration(
      'coin_market_snapshots',
      (doc) => ({ id: doc.id, provider: doc.provider }),
      (doc, maps) => {
        const mapped = {
          ...doc,
          provider: String(doc.provider ?? 'coingecko').toLowerCase(),
          internalCoinId: mapInternalCoinId(doc, maps),
          migratedAt: new Date(),
          migrationVersion: 'coin-domain-v1',
        };
        delete (mapped as any)._id;
        return mapped;
      },
      unresolvedQueueRows
    );
  });

  await runPhase('exchange_listed_assets', async () => {
    await genericUpsertMigration(
      'exchange_listed_assets',
      (doc) => ({ base_asset: doc.base_asset, provider: doc.provider }),
      (doc, maps) => {
        const mapped = {
          ...doc,
          internalCoinId: mapInternalCoinId(doc, maps),
          migratedAt: new Date(),
          migrationVersion: 'coin-domain-v1',
        };
        delete (mapped as any)._id;
        return mapped;
      },
      unresolvedQueueRows
    );
  });

  await runPhase('exchange_asset_ingest_raw', async () => {
    await genericUpsertMigration(
      'exchange_asset_ingest_raw',
      (doc) => ({ provider: doc.provider, provider_coin_id: doc.provider_coin_id }),
      (doc, maps) => {
        const mapped = {
          ...doc,
          internalCoinId: mapInternalCoinId(doc, maps),
          migratedAt: new Date(),
          migrationVersion: 'coin-domain-v1',
        };
        delete (mapped as any)._id;
        return mapped;
      },
      unresolvedQueueRows
    );
  });

  await runPhase('coin_news_tagging_map', async () => {
    await genericUpsertMigration(
      'coin_news_tagging_map',
      (doc) => ({ symbol: doc.symbol }),
      (doc, maps) => {
        const mapped = {
          ...doc,
          internalCoinId: mapInternalCoinId(doc, maps),
          migratedAt: new Date(),
          migrationVersion: 'coin-domain-v1',
        };
        delete (mapped as any)._id;
        return mapped;
      },
      unresolvedQueueRows
    );
  });

  await runPhase('market_ohlcv_candles', async () => {
    await migrateTimeSeriesWithMerge('market_ohlcv_candles');
  });

  await runPhase('exchange_trade_ticks', async () => {
    await migrateTimeSeriesWithMerge('exchange_trade_ticks');
  });

  await writeUnresolvedQueue(unresolvedQueueRows);

  const db = mongoose.connection.db;
  if (db) {
    for (const [phase, names] of Object.entries(LEGACY_TO_TARGET) as Array<[PhaseKey, { legacy: string; target: string }]>) {
      const [legacyCount, targetCount] = await Promise.all([
        collectionExists(names.legacy) ? db.collection(names.legacy).countDocuments() : Promise.resolve(0),
        db.collection(names.target).countDocuments(),
      ]);
      console.log(`[parity] ${phase}: legacy=${legacyCount} target=${targetCount}`);
    }
  }
}

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[migrate] failed', error);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });

