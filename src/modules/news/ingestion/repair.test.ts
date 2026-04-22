import type { INewsArticleCoin } from '../models/NewsArticle';
import { buildNewsCoinDerivationContext, deriveNewsArticleCoins } from './coinDerivation';
import { planRepairDecision, summarizeRepairDecisions } from './repair';

function category(id: string) {
  return { id, key: id.toLowerCase(), name: id };
}

describe('news coin tag repair planning', () => {
  it('reports a dry-run change for a bad BTC article and no-op for a correct USDT article', () => {
    const ctx = buildNewsCoinDerivationContext(
      ['BTC', 'USDT', 'TRUMP', 'MOVE', 'TIME'],
      [
        { symbol: 'BTC', name: 'Bitcoin', keywords: ['bitcoin'] },
        { symbol: 'USDT', name: 'USDT', keywords: ['usdt'] },
        { symbol: 'TRUMP', name: 'TRUMP', keywords: ['trump'] },
        { symbol: 'MOVE', name: 'MOVE', keywords: ['move'] },
        { symbol: 'TIME', name: 'TIME', keywords: ['time'] },
      ]
    );

    const btcArticle = {
      externalId: '60814665',
      title: 'American Bitcoin Shares Spike After Trump-Backed Firm Activates 11K BTC Miners',
      subtitle: '',
      categories: [category('BTC')],
      coins: [{ symbol: 'TRUMP', name: 'TRUMP' }] as INewsArticleCoin[],
      sourceUrl: 'https://example.com/btc',
      source: { key: 'coindesk', name: 'CoinDesk', lang: 'en' },
    };
    const usdtArticle = {
      externalId: '60814186',
      title: 'USDT Whale Transfer: Massive 200 Million Dollar Move to Binance Sparks Market Speculation',
      subtitle: '',
      categories: [],
      coins: [{ symbol: 'USDT', name: 'USDT' }] as INewsArticleCoin[],
      sourceUrl: 'https://example.com/usdt',
      source: { key: 'coindesk', name: 'CoinDesk', lang: 'en' },
    };

    const btcRecomputed = deriveNewsArticleCoins(
      {
        title: btcArticle.title,
        subtitle: btcArticle.subtitle,
        categories: btcArticle.categories.map((entry) => entry.id),
      },
      ctx
    ).coins;
    const usdtRecomputed = deriveNewsArticleCoins(
      {
        title: usdtArticle.title,
        subtitle: usdtArticle.subtitle,
      },
      ctx
    ).coins;

    const decisions = [
      planRepairDecision(btcArticle, btcRecomputed),
      planRepairDecision(usdtArticle, usdtRecomputed),
    ];
    const summary = summarizeRepairDecisions(decisions, 'dry-run');

    expect(decisions[0].changed).toBe(true);
    expect(decisions[0].newCoins).toEqual([{ symbol: 'BTC', name: 'Bitcoin' }]);
    expect(decisions[0].removedSymbols).toEqual(['TRUMP']);

    expect(decisions[1].changed).toBe(false);
    expect(decisions[1].newCoins).toEqual([{ symbol: 'USDT', name: 'USDT' }]);

    expect(summary.scanned).toBe(2);
    expect(summary.changed).toBe(1);
    expect(summary.unchanged).toBe(1);
    expect(summary.updated).toBe(1);
    expect(summary.topRemovedFalsePositiveSymbols).toEqual([{ symbol: 'TRUMP', count: 1 }]);
  });
});
