#!/usr/bin/env npx ts-node
/**
 * Compares cmc_labeled_coins and labeled_active_coins collections for duplicates.
 * Matches by symbol (case-insensitive). Generates a report to help decide whether to keep both or one.
 *
 * Usage: npm run script:compare-duplicates
 *        npm run script:compare-duplicates -- --out report.txt  (write to file)
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { config } from '../src/config/env';
import { CmcLabeledCoin } from '../src/modules/coin/models/CmcLabeledCoin';
import { LabeledActiveCoin } from '../src/modules/coin/models/LabeledActiveCoin';

interface CmcDoc {
  id: number;
  symbol: string;
  name: string;
  cmc_rank?: number;
  quote_usd?: { price?: number; market_cap?: number; percent_change_24h?: number };
  coinIds: Record<string, string>;
}

interface ActiveDoc {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank?: number;
  current_price?: number;
  market_cap?: number;
  price_change_percentage_24h?: number;
  relatedIDs: Record<string, string>;
}

function normalizeSymbol(s: string): string {
  return (s ?? '').trim().toUpperCase();
}

function providerCount(ids: Record<string, string>): number {
  return Object.keys(ids ?? {}).filter((k) => ids[k]).length;
}

async function main(): Promise<void> {
  await mongoose.connect(config.mongoUri);

  const [cmcCoins, activeCoins] = await Promise.all([
    CmcLabeledCoin.find().select('id symbol name cmc_rank quote_usd coinIds').lean().exec(),
    LabeledActiveCoin.find()
      .select('id symbol name market_cap_rank current_price market_cap price_change_percentage_24h relatedIDs')
      .lean()
      .exec(),
  ]);

  const cmcBySymbol = new Map<string, CmcDoc[]>();
  for (const c of cmcCoins as CmcDoc[]) {
    const key = normalizeSymbol(c.symbol);
    const list = cmcBySymbol.get(key) ?? [];
    list.push(c);
    cmcBySymbol.set(key, list);
  }

  const activeBySymbol = new Map<string, ActiveDoc[]>();
  for (const a of activeCoins as ActiveDoc[]) {
    const key = normalizeSymbol(a.symbol);
    const list = activeBySymbol.get(key) ?? [];
    list.push(a);
    activeBySymbol.set(key, list);
  }

  const allSymbols = new Set([...cmcBySymbol.keys(), ...activeBySymbol.keys()]);

  const overlap: Array<{
    symbol: string;
    cmc: CmcDoc;
    active: ActiveDoc;
    priceDiffPct?: number;
    marketCapDiffPct?: number;
    cmcProviders: number;
    activeProviders: number;
  }> = [];
  const primaryOverlap: Array<{
    symbol: string;
    cmc: CmcDoc;
    active: ActiveDoc;
    priceDiffPct?: number;
    cmcProviders: number;
    activeProviders: number;
  }> = [];
  const cmcOnly: CmcDoc[] = [];
  const activeOnly: ActiveDoc[] = [];
  const symbolCollisions: Array<{ symbol: string; cmcCount: number; activeCount: number }> = [];

  for (const sym of allSymbols) {
    const cmcList = cmcBySymbol.get(sym) ?? [];
    const activeList = activeBySymbol.get(sym) ?? [];

    if (cmcList.length > 1 || activeList.length > 1) {
      symbolCollisions.push({
        symbol: sym,
        cmcCount: cmcList.length,
        activeCount: activeList.length,
      });
    }

    if (cmcList.length > 0 && activeList.length > 0) {
      const cmcBest = cmcList.sort((a, b) => (a.cmc_rank ?? 99999) - (b.cmc_rank ?? 99999))[0];
      const activeBest = activeList.sort(
        (a, b) => (a.market_cap_rank ?? 99999) - (b.market_cap_rank ?? 99999)
      )[0];
      const cmcPrice = cmcBest.quote_usd?.price;
      const activePrice = activeBest.current_price;
      let priceDiffPct: number | undefined;
      if (cmcPrice != null && activePrice != null && activePrice > 0) {
        priceDiffPct = ((cmcPrice - activePrice) / activePrice) * 100;
      }
      primaryOverlap.push({
        symbol: sym,
        cmc: cmcBest,
        active: activeBest,
        priceDiffPct,
        cmcProviders: providerCount(cmcBest.coinIds),
        activeProviders: providerCount(activeBest.relatedIDs),
      });

      for (const cmc of cmcList) {
        for (const active of activeList) {
          const cmcPrice = cmc.quote_usd?.price;
          const activePrice = active.current_price;
          let priceDiffPct: number | undefined;
          if (cmcPrice != null && activePrice != null && activePrice > 0) {
            priceDiffPct = ((cmcPrice - activePrice) / activePrice) * 100;
          }
          const cmcMc = cmc.quote_usd?.market_cap;
          const activeMc = active.market_cap;
          let marketCapDiffPct: number | undefined;
          if (cmcMc != null && activeMc != null && activeMc > 0) {
            marketCapDiffPct = ((cmcMc - activeMc) / activeMc) * 100;
          }
          overlap.push({
            symbol: sym,
            cmc,
            active,
            priceDiffPct,
            marketCapDiffPct,
            cmcProviders: providerCount(cmc.coinIds),
            activeProviders: providerCount(active.relatedIDs),
          });
        }
      }
    } else if (cmcList.length > 0) {
      cmcOnly.push(...cmcList);
    } else {
      activeOnly.push(...activeList);
    }
  }

  const report: string[] = [];
  report.push('');
  report.push('='.repeat(80));
  report.push('COIN DUPLICACY REPORT: cmc_labeled_coins vs labeled_active_coins');
  report.push('='.repeat(80));
  report.push('');
  report.push('MATCHING: Case-insensitive symbol (e.g. BTC = btc)');
  report.push('');

  report.push('-'.repeat(80));
  report.push('SUMMARY');
  report.push('-'.repeat(80));
  report.push(`  cmc_labeled_coins total:     ${cmcCoins.length}`);
  report.push(`  labeled_active_coins total:  ${activeCoins.length}`);
  report.push(`  Unique symbols (combined):  ${allSymbols.size}`);
  report.push(`  OVERLAP (all pairs):       ${overlap.length}`);
  report.push(`  PRIMARY overlap (unique):   ${primaryOverlap.length} (best-ranked per symbol)`);
  report.push(`  CMC only:                   ${cmcOnly.length}`);
  report.push(`  labeled_active only:       ${activeOnly.length}`);
  report.push(`  Symbol collisions:          ${symbolCollisions.length} symbols map to multiple coins`);
  report.push('');

  if (overlap.length > 0) {
    report.push('-'.repeat(80));
    report.push('SYMBOL COLLISIONS (symbol maps to multiple coins in either collection)');
    report.push('-'.repeat(80));
    const topCollisions = symbolCollisions
      .filter((s) => s.cmcCount > 1 || s.activeCount > 1)
      .sort((a, b) => b.cmcCount + b.activeCount - (a.cmcCount + a.activeCount))
      .slice(0, 15);
    report.push(`  Total: ${symbolCollisions.length}. Top 15 by collision size:`);
    for (const s of topCollisions) {
      report.push(`    ${s.symbol}: CMC=${s.cmcCount} coins, Active=${s.activeCount} coins`);
    }
    report.push('');
  }

  if (primaryOverlap.length > 0) {
    report.push('-'.repeat(80));
    report.push('PRIMARY OVERLAP ANALYSIS (best-ranked per symbol)');
    report.push('-'.repeat(80));

    const priceDiffs = primaryOverlap
      .filter((o) => o.priceDiffPct != null && Math.abs(o.priceDiffPct) < 50)
      .map((o) => o.priceDiffPct!);
    if (priceDiffs.length > 0) {
      const avgPriceDiff =
        priceDiffs.reduce((a, b) => a + b, 0) / priceDiffs.length;
      const maxPriceDiff = Math.max(...priceDiffs.map(Math.abs));
      report.push(`  Price diff (CMC vs CoinGecko, excluding outliers): avg ${avgPriceDiff.toFixed(2)}%, max abs ${maxPriceDiff.toFixed(2)}%`);
    }

    const cmcMoreProviders = primaryOverlap.filter((o) => o.cmcProviders > o.activeProviders).length;
    const activeMoreProviders = primaryOverlap.filter((o) => o.activeProviders > o.cmcProviders).length;
    const sameProviders = primaryOverlap.filter((o) => o.cmcProviders === o.activeProviders).length;
    report.push(`  Provider coverage: CMC has more in ${cmcMoreProviders}, active has more in ${activeMoreProviders}, same in ${sameProviders}`);
    report.push('');

    report.push('SAMPLE PRIMARY DUPLICATES (first 15 by symbol):');
    report.push('');
    const sample = primaryOverlap.slice(0, 15);
    for (const o of sample) {
      report.push(`  [${o.symbol}]`);
      report.push(`    CMC:     id=${o.cmc.id} rank=${o.cmc.cmc_rank ?? '?'} price=$${o.cmc.quote_usd?.price?.toLocaleString() ?? '?'} providers=${o.cmcProviders}`);
      report.push(`    Active:  id=${o.active.id} rank=${o.active.market_cap_rank ?? '?'} price=$${o.active.current_price?.toLocaleString() ?? '?'} providers=${o.activeProviders}`);
      if (o.priceDiffPct != null && Math.abs(o.priceDiffPct) < 50) {
        report.push(`    Price diff: ${o.priceDiffPct.toFixed(2)}%`);
      }
      report.push('');
    }
  }

  if (cmcOnly.length > 0) {
    report.push('-'.repeat(80));
    report.push('CMC ONLY (not in labeled_active_coins)');
    report.push('-'.repeat(80));
    const topByRank = [...cmcOnly]
      .filter((c) => c.cmc_rank != null)
      .sort((a, b) => (a.cmc_rank ?? 0) - (b.cmc_rank ?? 0))
      .slice(0, 10);
    report.push(`  Total: ${cmcOnly.length}. Top 10 by CMC rank:`);
    for (const c of topByRank) {
      report.push(`    ${c.symbol} (rank ${c.cmc_rank}) - ${c.name}`);
    }
    report.push('');
  }

  if (activeOnly.length > 0) {
    report.push('-'.repeat(80));
    report.push('LABELED_ACTIVE ONLY (not in cmc_labeled_coins)');
    report.push('-'.repeat(80));
    const topByRank = [...activeOnly]
      .filter((a) => a.market_cap_rank != null)
      .sort((a, b) => (a.market_cap_rank ?? 0) - (b.market_cap_rank ?? 0))
      .slice(0, 10);
    report.push(`  Total: ${activeOnly.length}. Top 10 by market_cap_rank:`);
    for (const a of topByRank) {
      report.push(`    ${a.symbol} (rank ${a.market_cap_rank}) - ${a.name}`);
    }
    report.push('');
  }

  report.push('-'.repeat(80));
  report.push('RECOMMENDATIONS');
  report.push('-'.repeat(80));
  report.push('  - cmc_labeled_coins: CMC API, numeric id, 8728 coins, quote.USD data');
  report.push('  - labeled_active_coins: CoinGecko API, string id, ~8750 coins (35 pages x 250), image URL');
  report.push('');
  if (overlap.length > 0) {
    report.push('  Overlap: Most top coins appear in both. Price/market_cap may differ slightly');
  }
  report.push('  Keep both if: You need CMC and CoinGecko as separate sources, or different ID schemes.');
  report.push('  Keep cmc_labeled_coins only if: CMC is primary, need numeric IDs, larger catalog (8728).');
  report.push('  Keep labeled_active_coins only if: CoinGecko is primary, need image URLs, smaller active set.');
  report.push('');
  report.push('='.repeat(80));
  report.push('');

  const reportText = report.join('\n');
  console.log(reportText);

  const outIdx = process.argv.indexOf('--out');
  if (outIdx >= 0 && process.argv[outIdx + 1]) {
    const fs = await import('fs');
    const outPath = process.argv[outIdx + 1];
    fs.writeFileSync(outPath, reportText, 'utf-8');
    console.log(`\nReport written to ${outPath}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
