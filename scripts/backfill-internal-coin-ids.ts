/*
 * backfill-internal-coin-ids.ts
 *
 * Strict symbol-only backfill of `internalCoinId` into four secondary
 * collections using `coin_registry` as the sole canonical origin.
 *
 * Modes:
 *   --dry-run  (default): plan updates and queue additions, write nothing.
 *   --apply             : execute the planned writes.
 *
 * Trusted sources (enforced structurally):
 *   - Canonical origin   : `coin_registry` rows with non-null internalCoinId.
 *                          Only these produce new (symbol -> internalCoinId) mappings.
 *   - Secondary confirmers (read-only): coingecko_coin_mappings, cmc_coin_mappings,
 *     coin_market_snapshots, exchange_listed_assets. They may agree (ignored),
 *     disagree (mark symbol AMBIGUOUS and disable propagation), or be null
 *     (ignored). They MAY NOT introduce new mappings. Symbols unknown to
 *     canonical remain UNKNOWN and are never backfilled this phase.
 *
 * Idempotency:
 *   - Update filter is always `{ _id, internalCoinId: null }` so populated rows
 *     are never overwritten.
 *   - Queue upserts use `(normalizedToken, status in {pending, retrying,
 *     manual_review})` as the natural key with `$setOnInsert` guards on
 *     firstSeenAt/inputToken/normalizedToken so rerun only refreshes the row.
 *   - A second `--apply` on an unchanged DB must produce zero writes.
 */

import { randomUUID } from 'crypto';
import mongoose, { AnyBulkWriteOperation } from 'mongoose';

type Mode = 'dry-run' | 'apply';

const CANONICAL_COLLECTION = 'coin_registry';
const QUEUE_COLLECTION = 'coin_identity_resolution_queue';
const BATCH_SIZE = 500;

type TargetSpec = {
  name: string;
  symbolField: 'symbol' | 'base_asset';
  inputTokenBuilder: (row: Record<string, unknown>) => string;
  evidenceBuilder: (row: Record<string, unknown>) => Record<string, unknown>;
};

const TARGETS: TargetSpec[] = [
  {
    name: 'coingecko_coin_mappings',
    symbolField: 'symbol',
    inputTokenBuilder: (row) => String(row.id ?? row.symbol ?? ''),
    evidenceBuilder: (row) => ({
      phase: 'backfill-internal-coin-ids-v1',
      collection: 'coingecko_coin_mappings',
      id: row.id,
      symbol: row.symbol,
      name: row.name,
    }),
  },
  {
    name: 'cmc_coin_mappings',
    symbolField: 'symbol',
    inputTokenBuilder: (row) => String(row.id ?? row.symbol ?? ''),
    evidenceBuilder: (row) => ({
      phase: 'backfill-internal-coin-ids-v1',
      collection: 'cmc_coin_mappings',
      id: row.id,
      symbol: row.symbol,
      name: row.name,
    }),
  },
  {
    name: 'coin_market_snapshots',
    symbolField: 'symbol',
    inputTokenBuilder: (row) => String(row.id ?? row.symbol ?? ''),
    evidenceBuilder: (row) => ({
      phase: 'backfill-internal-coin-ids-v1',
      collection: 'coin_market_snapshots',
      id: row.id,
      provider: row.provider,
      symbol: row.symbol,
    }),
  },
  {
    name: 'exchange_listed_assets',
    symbolField: 'base_asset',
    inputTokenBuilder: (row) =>
      String(row.base_asset ?? '') +
      (row.provider ? `@${row.provider}` : '') +
      (row.quote_asset ? `/${row.quote_asset}` : ''),
    evidenceBuilder: (row) => ({
      phase: 'backfill-internal-coin-ids-v1',
      collection: 'exchange_listed_assets',
      provider: row.provider,
      base_asset: row.base_asset,
      quote_asset: row.quote_asset,
    }),
  },
];

function parseMode(argv: string[]): Mode {
  const hasDry = argv.includes('--dry-run');
  const hasApply = argv.includes('--apply');
  if (hasDry && hasApply) {
    throw new Error('Pass either --dry-run or --apply, not both.');
  }
  if (hasApply) return 'apply';
  return 'dry-run';
}

function normalizeSymbol(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

function normalizeToken(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

async function connectFromEnv(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error('Missing Mongo URI. Set MONGODB_URI, MONGO_URI, or DATABASE_URL.');
  await mongoose.connect(uri);
}

type TrustedMap = {
  map: Map<string, string>;
  ambiguous: Set<string>;
  canonicalSymbols: Set<string>;
  counts: {
    canonical_rows: number;
    canonical_symbols: number;
    canonical_ambiguous: number;
    secondary_consistent: number;
    secondary_conflicting: number;
    final_map_size: number;
  };
};

async function loadTrustedMap(): Promise<TrustedMap> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');

  const canonicalSymbols = new Set<string>();
  const candidate = new Map<string, Set<string>>();

  let canonicalRows = 0;
  const cursor = db
    .collection(CANONICAL_COLLECTION)
    .find({ internalCoinId: { $ne: null } }, { projection: { internalCoinId: 1, symbol: 1 } });
  for await (const row of cursor) {
    canonicalRows += 1;
    const internalCoinId = String((row as Record<string, unknown>).internalCoinId ?? '').trim();
    const symbol = normalizeSymbol((row as Record<string, unknown>).symbol);
    if (!internalCoinId || !symbol) continue;
    canonicalSymbols.add(symbol);
    const set = candidate.get(symbol) ?? new Set<string>();
    set.add(internalCoinId);
    candidate.set(symbol, set);
  }

  const canonicalAmbiguous = [...candidate.values()].filter((s) => s.size > 1).length;

  let secondaryConsistent = 0;
  let secondaryConflicting = 0;

  for (const target of TARGETS) {
    const secondaryCursor = db
      .collection(target.name)
      .find(
        { internalCoinId: { $ne: null } },
        { projection: { internalCoinId: 1, [target.symbolField]: 1 } }
      );
    for await (const row of secondaryCursor) {
      const internalCoinId = String((row as Record<string, unknown>).internalCoinId ?? '').trim();
      const symbol = normalizeSymbol((row as Record<string, unknown>)[target.symbolField]);
      if (!internalCoinId || !symbol) continue;
      if (!canonicalSymbols.has(symbol)) {
        // secondary-only evidence must NOT originate a mapping — drop silently.
        continue;
      }
      const set = candidate.get(symbol);
      if (!set) continue;
      if (set.has(internalCoinId)) {
        secondaryConsistent += 1;
      } else {
        secondaryConflicting += 1;
        set.add(internalCoinId);
      }
    }
  }

  const ambiguous = new Set<string>();
  const map = new Map<string, string>();
  for (const [symbol, ids] of candidate) {
    if (ids.size === 1) {
      map.set(symbol, [...ids][0]);
    } else {
      ambiguous.add(symbol);
    }
  }

  // Self-check: canonicalSymbols must be a superset of the final map's keys.
  for (const s of map.keys()) {
    if (!canonicalSymbols.has(s)) {
      throw new Error(`Invariant violated: final map contains symbol ${s} not in canonical registry.`);
    }
  }

  return {
    map,
    ambiguous,
    canonicalSymbols,
    counts: {
      canonical_rows: canonicalRows,
      canonical_symbols: canonicalSymbols.size,
      canonical_ambiguous: canonicalAmbiguous,
      secondary_consistent: secondaryConsistent,
      secondary_conflicting: secondaryConflicting,
      final_map_size: map.size,
    },
  };
}

type PerCollectionResult = {
  collection: string;
  scanned: number;
  direct_match: number;
  ambiguous_queued: number;
  no_symbol_queued: number;
  missing_symbol_field: number;
  null_before: number;
  null_after?: number;
  queue_upserts: number;
};

async function processCollection(
  target: TargetSpec,
  trusted: TrustedMap,
  mode: Mode,
  runId: string,
  nowIso: Date
): Promise<PerCollectionResult> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');

  const coll = db.collection(target.name);
  const queue = db.collection(QUEUE_COLLECTION);

  const nullBefore = await coll.countDocuments({ internalCoinId: null });
  const result: PerCollectionResult = {
    collection: target.name,
    scanned: 0,
    direct_match: 0,
    ambiguous_queued: 0,
    no_symbol_queued: 0,
    missing_symbol_field: 0,
    null_before: nullBefore,
    queue_upserts: 0,
  };

  let updateOps: AnyBulkWriteOperation[] = [];
  let queueOps: AnyBulkWriteOperation[] = [];

  const flushUpdates = async () => {
    if (!updateOps.length) return;
    if (mode === 'apply') {
      await coll.bulkWrite(updateOps, { ordered: false });
    }
    updateOps = [];
  };
  const flushQueue = async () => {
    if (!queueOps.length) return;
    if (mode === 'apply') {
      await queue.bulkWrite(queueOps, { ordered: false });
    }
    queueOps = [];
  };

  const cursor = coll.find({ internalCoinId: null });
  for await (const raw of cursor) {
    const row = raw as Record<string, unknown>;
    result.scanned += 1;

    const rawSymbol = row[target.symbolField];
    const symbol = normalizeSymbol(rawSymbol);

    if (!symbol) {
      result.missing_symbol_field += 1;
      const inputToken = target.inputTokenBuilder(row);
      const normalized = normalizeToken(inputToken);
      queueOps.push({
        updateOne: {
          filter: {
            normalizedToken: normalized,
            status: { $in: ['pending', 'retrying', 'manual_review'] },
          },
          update: {
            $setOnInsert: {
              inputToken,
              normalizedToken: normalized,
              firstSeenAt: nowIso,
            },
            $set: {
              evidence: { ...target.evidenceBuilder(row), reason: 'missing_symbol', runId },
              lastTriedAt: nowIso,
              status: 'pending',
              confidence: 0,
            },
            $inc: { retryCount: 1 },
          },
          upsert: true,
        },
      });
      result.no_symbol_queued += 1;
      if (queueOps.length >= BATCH_SIZE) {
        result.queue_upserts += queueOps.length;
        await flushQueue();
      }
      continue;
    }

    if (trusted.ambiguous.has(symbol)) {
      const inputToken = target.inputTokenBuilder(row);
      const normalized = normalizeToken(inputToken);
      queueOps.push({
        updateOne: {
          filter: {
            normalizedToken: normalized,
            status: { $in: ['pending', 'retrying', 'manual_review'] },
          },
          update: {
            $setOnInsert: {
              inputToken,
              normalizedToken: normalized,
              firstSeenAt: nowIso,
            },
            $set: {
              evidence: { ...target.evidenceBuilder(row), reason: 'ambiguous_symbol', symbol, runId },
              lastTriedAt: nowIso,
              status: 'manual_review',
              confidence: 0,
            },
            $inc: { retryCount: 1 },
          },
          upsert: true,
        },
      });
      result.ambiguous_queued += 1;
      if (queueOps.length >= BATCH_SIZE) {
        result.queue_upserts += queueOps.length;
        await flushQueue();
      }
      continue;
    }

    const internalCoinId = trusted.map.get(symbol);
    if (internalCoinId) {
      updateOps.push({
        updateOne: {
          filter: { _id: row._id as unknown as any, internalCoinId: null },
          update: {
            $set: {
              internalCoinId,
              migrationVersion: 'coin-domain-v2-strict',
              backfilledAt: nowIso,
            },
          },
        },
      });
      result.direct_match += 1;
      if (updateOps.length >= BATCH_SIZE) {
        await flushUpdates();
      }
      continue;
    }

    // Symbol is present but unknown to canonical — queue as pending.
    const inputToken = target.inputTokenBuilder(row);
    const normalized = normalizeToken(inputToken);
    queueOps.push({
      updateOne: {
        filter: {
          normalizedToken: normalized,
          status: { $in: ['pending', 'retrying', 'manual_review'] },
        },
        update: {
          $setOnInsert: {
            inputToken,
            normalizedToken: normalized,
            firstSeenAt: nowIso,
          },
          $set: {
            evidence: { ...target.evidenceBuilder(row), reason: 'unknown_symbol', symbol, runId },
            lastTriedAt: nowIso,
            status: 'pending',
            confidence: 0,
          },
          $inc: { retryCount: 1 },
        },
        upsert: true,
      },
    });
    result.no_symbol_queued += 1;
    if (queueOps.length >= BATCH_SIZE) {
      result.queue_upserts += queueOps.length;
      await flushQueue();
    }
  }

  result.queue_upserts += queueOps.length;
  await flushUpdates();
  await flushQueue();

  if (mode === 'apply') {
    result.null_after = await coll.countDocuments({ internalCoinId: null });
  } else {
    // In dry-run, simulate the expected null_after so the operator can eyeball it.
    result.null_after = nullBefore - result.direct_match;
  }
  return result;
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const runId = randomUUID();
  const startedAt = new Date();
  console.log(`[backfill] mode=${mode} runId=${runId} startedAt=${startedAt.toISOString()}`);

  await connectFromEnv();
  try {
    const trusted = await loadTrustedMap();
    console.log('[backfill] trusted map summary:');
    console.log(JSON.stringify(trusted.counts, null, 2));
    console.log(
      `[backfill] ambiguous symbols (${trusted.ambiguous.size}): ${[...trusted.ambiguous].sort().join(', ') || '(none)'}`
    );

    const perCollection: PerCollectionResult[] = [];
    for (const target of TARGETS) {
      console.log(`[backfill] processing ${target.name} ...`);
      const res = await processCollection(target, trusted, mode, runId, startedAt);
      perCollection.push(res);
      console.log(JSON.stringify(res, null, 2));
    }

    const totals = perCollection.reduce(
      (acc, r) => ({
        scanned: acc.scanned + r.scanned,
        direct_match: acc.direct_match + r.direct_match,
        ambiguous_queued: acc.ambiguous_queued + r.ambiguous_queued,
        no_symbol_queued: acc.no_symbol_queued + r.no_symbol_queued,
        missing_symbol_field: acc.missing_symbol_field + r.missing_symbol_field,
        queue_upserts: acc.queue_upserts + r.queue_upserts,
      }),
      { scanned: 0, direct_match: 0, ambiguous_queued: 0, no_symbol_queued: 0, missing_symbol_field: 0, queue_upserts: 0 }
    );

    console.log('[backfill] totals:');
    console.log(JSON.stringify(totals, null, 2));
    console.log(
      `[backfill] mode=${mode} ${mode === 'dry-run' ? '(no writes performed)' : '(writes executed)'} runId=${runId}`
    );
  } finally {
    await mongoose.connection.close();
  }
}

main().catch((err) => {
  console.error('[backfill] FATAL:', err);
  process.exit(1);
});
