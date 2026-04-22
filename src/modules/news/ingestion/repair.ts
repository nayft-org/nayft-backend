import mongoose, { AnyBulkWriteOperation } from 'mongoose';
import { FilteredCoin } from '../../coin/models/FilteredCoin';
import { CoinMaster } from '../models/CoinMaster';
import { NewsArticle } from '../models/NewsArticle';
import type { INewsArticle, INewsArticleCoin } from '../models/NewsArticle';
import { buildNewsCoinDerivationContext, deriveNewsArticleCoins } from './coinDerivation';

export type RepairMode = 'dry-run' | 'apply';

export type RepairNewsArgs = {
  mode: RepairMode;
  externalId?: string;
};

type RepairableArticle = Pick<
  INewsArticle,
  'externalId' | 'title' | 'subtitle' | 'categories' | 'coins' | 'sourceUrl' | 'source'
>;

export type RepairDecision = {
  externalId: string;
  oldCoins: INewsArticleCoin[];
  newCoins: INewsArticleCoin[];
  changed: boolean;
  willClear: boolean;
  shouldUpdateInApply: boolean;
  removedSymbols: string[];
  addedSymbols: string[];
};

export type RepairSummary = {
  mode: RepairMode;
  externalId?: string;
  scanned: number;
  changed: number;
  unchanged: number;
  cleared: number;
  updated: number;
  topRemovedFalsePositiveSymbols: Array<{ symbol: string; count: number }>;
  samples: Array<{
    externalId: string;
    oldSymbols: string[];
    newSymbols: string[];
    shouldUpdateInApply: boolean;
  }>;
};

const BATCH_SIZE = 250;

function canonicalizeCoins(coins: INewsArticleCoin[]): INewsArticleCoin[] {
  return [...coins].sort((a, b) => a.symbol.localeCompare(b.symbol) || a.name.localeCompare(b.name));
}

function sameCoins(left: INewsArticleCoin[], right: INewsArticleCoin[]): boolean {
  const a = canonicalizeCoins(left);
  const b = canonicalizeCoins(right);
  if (a.length !== b.length) return false;
  return a.every((coin, idx) => coin.symbol === b[idx].symbol && coin.name === b[idx].name);
}

export function planRepairDecision(
  article: RepairableArticle,
  recomputedCoins: INewsArticleCoin[]
): RepairDecision {
  const oldCoins = canonicalizeCoins(article.coins || []);
  const newCoins = canonicalizeCoins(recomputedCoins);
  const oldSymbols = new Set(oldCoins.map((coin) => coin.symbol));
  const newSymbols = new Set(newCoins.map((coin) => coin.symbol));
  const removedSymbols = [...oldSymbols].filter((symbol) => !newSymbols.has(symbol)).sort();
  const addedSymbols = [...newSymbols].filter((symbol) => !oldSymbols.has(symbol)).sort();
  const changed = !sameCoins(oldCoins, newCoins);
  const willClear = oldCoins.length > 0 && newCoins.length === 0;
  const shouldUpdateInApply = changed && (newCoins.length > 0 || willClear);

  return {
    externalId: article.externalId,
    oldCoins,
    newCoins,
    changed,
    willClear,
    shouldUpdateInApply,
    removedSymbols,
    addedSymbols,
  };
}

export function summarizeRepairDecisions(
  decisions: RepairDecision[],
  mode: RepairMode,
  externalId?: string
): RepairSummary {
  const removedCounts = new Map<string, number>();
  let changed = 0;
  let unchanged = 0;
  let cleared = 0;
  let updated = 0;

  for (const decision of decisions) {
    if (decision.changed) changed += 1;
    else unchanged += 1;
    if (decision.willClear) cleared += 1;
    if (decision.shouldUpdateInApply) updated += 1;
    for (const symbol of decision.removedSymbols) {
      removedCounts.set(symbol, (removedCounts.get(symbol) || 0) + 1);
    }
  }

  const topRemovedFalsePositiveSymbols = [...removedCounts.entries()]
    .map(([symbol, count]) => ({ symbol, count }))
    .sort((a, b) => b.count - a.count || a.symbol.localeCompare(b.symbol))
    .slice(0, 10);

  return {
    mode,
    externalId,
    scanned: decisions.length,
    changed,
    unchanged,
    cleared,
    updated,
    topRemovedFalsePositiveSymbols,
    samples: decisions
      .filter((decision) => decision.changed)
      .slice(0, 10)
      .map((decision) => ({
        externalId: decision.externalId,
        oldSymbols: decision.oldCoins.map((coin) => coin.symbol),
        newSymbols: decision.newCoins.map((coin) => coin.symbol),
        shouldUpdateInApply: decision.shouldUpdateInApply,
      })),
  };
}

export async function runRepairNewsCoinTags(args: RepairNewsArgs): Promise<RepairSummary> {
  const trackedBaseAssets = (await FilteredCoin.distinct('base_asset', {
    base_asset: { $exists: true, $nin: [null, ''] },
  })) as string[];

  const trackedSymbols = [...new Set(trackedBaseAssets.map((asset) => String(asset).trim().toUpperCase()).filter(Boolean))];
  const coinMasters = await CoinMaster.find({ symbol: { $in: trackedSymbols } })
    .select('symbol name keywords')
    .lean<Array<{ symbol: string; name: string; keywords?: string[] }>>();
  const ctx = buildNewsCoinDerivationContext(trackedBaseAssets, coinMasters);

  const filter = args.externalId ? { externalId: args.externalId } : {};
  const cursor = NewsArticle.find(filter)
    .select('externalId title subtitle categories coins sourceUrl source')
    .lean<RepairableArticle[]>()
    .cursor();

  const decisions: RepairDecision[] = [];
  let bulkOps: AnyBulkWriteOperation[] = [];

  for await (const article of cursor) {
    const categorySignals = (article.categories || [])
      .map((category) => category.id || category.key || category.name)
      .filter((value): value is string => Boolean(value));

    const { coins } = deriveNewsArticleCoins(
      {
        title: article.title,
        subtitle: article.subtitle,
        categories: categorySignals,
      },
      ctx
    );
    const decision = planRepairDecision(article, coins);
    decisions.push(decision);

    if (args.mode === 'apply' && decision.shouldUpdateInApply) {
      bulkOps.push({
        updateOne: {
          filter: { externalId: article.externalId },
          update: { $set: { coins: decision.newCoins } },
        },
      });
      if (bulkOps.length >= BATCH_SIZE) {
        await NewsArticle.bulkWrite(bulkOps);
        bulkOps = [];
      }
    }
  }

  if (args.mode === 'apply' && bulkOps.length > 0) {
    await NewsArticle.bulkWrite(bulkOps);
  }

  return summarizeRepairDecisions(decisions, args.mode, args.externalId);
}

export async function connectRepairMongo(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error('Missing Mongo URI. Set MONGODB_URI, MONGO_URI, or DATABASE_URL.');
  await mongoose.connect(uri);
}
