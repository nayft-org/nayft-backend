import { coinRepository } from '../coin/repository';
import { labeledActiveCoinRepository } from '../coin/labeledActiveCoinRepository';

/**
 * Map follow target ids (CoinGecko id, symbol, or internalCoinId) to uppercase symbols
 * for NewsArticle queries (`coins.symbol`).
 */
export async function resolveFollowSymbolsForTargets(targetIds: string[]): Promise<string[]> {
  const unique = [...new Set(targetIds.map((id) => String(id).trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const symbols = new Set<string>();
  const dbCoins = await coinRepository.findByIds(unique);
  const resolved = new Set(dbCoins.map((c) => c.coinId));

  for (const coin of dbCoins) {
    if (coin.symbol) symbols.add(coin.symbol.toUpperCase());
  }

  for (const targetId of unique) {
    if (resolved.has(targetId)) continue;

    let labeled = await labeledActiveCoinRepository.findByCoinId(targetId);
    if (!labeled) {
      const bySymbol = await coinRepository.findBySymbol(targetId);
      if (bySymbol?.symbol) {
        symbols.add(bySymbol.symbol.toUpperCase());
        continue;
      }
    }
    if (labeled?.symbol) {
      symbols.add(labeled.symbol.trim().toUpperCase());
    }
  }

  return [...symbols];
}
