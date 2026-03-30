import 'dotenv/config';
import { connectDatabase } from '../config/database';
import { CoinMaster } from '../modules/news/models';
import { Coin } from '../modules/coin/model';

const STATIC_COINS: { symbol: string; name: string; keywords: string[] }[] = [
  { symbol: 'BTC', name: 'Bitcoin', keywords: ['bitcoin', 'btc'] },
  { symbol: 'ETH', name: 'Ethereum', keywords: ['ethereum', 'eth'] },
  { symbol: 'SOL', name: 'Solana', keywords: ['solana', 'sol'] },
  { symbol: 'XRP', name: 'XRP', keywords: ['xrp', 'ripple'] },
  { symbol: 'ADA', name: 'Cardano', keywords: ['cardano', 'ada'] },
  { symbol: 'DOGE', name: 'Dogecoin', keywords: ['dogecoin', 'doge'] },
  { symbol: 'AVAX', name: 'Avalanche', keywords: ['avalanche', 'avax'] },
  { symbol: 'DOT', name: 'Polkadot', keywords: ['polkadot', 'dot'] },
  { symbol: 'MATIC', name: 'Polygon', keywords: ['polygon', 'matic'] },
  { symbol: 'LINK', name: 'Chainlink', keywords: ['chainlink', 'link'] },
  { symbol: 'UNI', name: 'Uniswap', keywords: ['uniswap', 'uni'] },
  { symbol: 'ATOM', name: 'Cosmos', keywords: ['cosmos', 'atom'] },
  { symbol: 'LTC', name: 'Litecoin', keywords: ['litecoin', 'ltc'] },
  { symbol: 'BCH', name: 'Bitcoin Cash', keywords: ['bitcoin cash', 'bch'] },
  { symbol: 'NEAR', name: 'NEAR Protocol', keywords: ['near', 'near protocol'] },
  { symbol: 'APT', name: 'Aptos', keywords: ['aptos', 'apt'] },
  { symbol: 'ARB', name: 'Arbitrum', keywords: ['arbitrum', 'arb'] },
  { symbol: 'OP', name: 'Optimism', keywords: ['optimism', 'op'] },
  { symbol: 'SUI', name: 'Sui', keywords: ['sui'] },
  { symbol: 'INJ', name: 'Injective', keywords: ['injective', 'inj'] },
  { symbol: 'TIA', name: 'Celestia', keywords: ['celestia', 'tia'] },
  { symbol: 'SEI', name: 'Sei', keywords: ['sei'] },
  { symbol: 'PEPE', name: 'Pepe', keywords: ['pepe', 'pepe coin'] },
  { symbol: 'SHIB', name: 'Shiba Inu', keywords: ['shiba', 'shib'] },
];

function generateKeywords(symbol: string, name: string): string[] {
  const keywords = new Set<string>();
  keywords.add(symbol.toLowerCase());
  keywords.add(name.toLowerCase());
  if (name.includes(' ')) {
    keywords.add(name.split(' ')[0].toLowerCase());
  }
  return Array.from(keywords);
}

export async function seedCoinMaster(): Promise<void> {
  await connectDatabase();

  const existing = await CoinMaster.find().lean();
  const existingSymbols = new Set(existing.map((c) => c.symbol.toUpperCase()));

  const toInsert: { symbol: string; name: string; keywords: string[] }[] = [];

  for (const coin of STATIC_COINS) {
    if (!existingSymbols.has(coin.symbol.toUpperCase())) {
      toInsert.push(coin);
      existingSymbols.add(coin.symbol.toUpperCase());
    }
  }

  let coins: { symbol?: string; name?: string }[] = [];
  try {
    coins = await Coin.find().lean();
  } catch {
    // Coin collection may not exist or auth may fail; continue with static coins only
  }
  for (const coin of coins) {
    const sym = (coin.symbol || '').toUpperCase();
    if (!sym) continue;
    if (!existingSymbols.has(sym)) {
      toInsert.push({
        symbol: sym,
        name: coin.name || coin.symbol || sym,
        keywords: generateKeywords(coin.symbol || sym, coin.name || coin.symbol || sym),
      });
      existingSymbols.add(sym);
    }
  }

  if (toInsert.length > 0) {
    await CoinMaster.insertMany(toInsert);
  }
}

if (require.main === module) {
  seedCoinMaster()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
