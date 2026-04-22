import { buildNewsCoinDerivationContext, deriveNewsArticleCoins } from './coinDerivation';

describe('deriveNewsArticleCoins', () => {
  const baseAssets = ['BTC', 'USDT', 'TRUMP', 'TIME', 'MOVE', 'BULL', 'MAJOR', 'EASY'];

  it('tags BTC from curated alias support without ticker corroboration', () => {
    const ctx = buildNewsCoinDerivationContext(baseAssets, [
      { symbol: 'BTC', name: 'Bitcoin', keywords: ['bitcoin'] },
    ]);

    const result = deriveNewsArticleCoins(
      { title: 'Bitcoin may hit new all-time highs this year' },
      ctx
    );

    expect(result.coins).toEqual([{ symbol: 'BTC', name: 'Bitcoin' }]);
  });

  it('does not tag MAJOR or BULL for a Bitcoin title when BTC is corroborated by category', () => {
    const ctx = buildNewsCoinDerivationContext(baseAssets, [
      { symbol: 'BTC', name: 'Bitcoin', keywords: ['bitcoin'] },
    ]);

    const result = deriveNewsArticleCoins(
      {
        title: 'Repo Market Stress Signals Bitcoin Is Positioned For Its Next Major Bull Cycle',
        categories: ['BTC'],
      },
      ctx
    );

    expect(result.coins).toEqual([{ symbol: 'BTC', name: 'Bitcoin' }]);
  });

  it('does not tag TRUMP from title-only text when BTC is the trusted signal', () => {
    const ctx = buildNewsCoinDerivationContext(baseAssets, [
      { symbol: 'BTC', name: 'Bitcoin', keywords: ['bitcoin'] },
      { symbol: 'TRUMP', name: 'TRUMP', keywords: ['trump'] },
    ]);

    const result = deriveNewsArticleCoins(
      {
        title: 'Bitcoin Tops $79,000 as Trump Extends US-Iran Ceasefire, S&P 500 Climbs',
        categories: ['BTC'],
      },
      ctx
    );

    expect(result.coins).toEqual([{ symbol: 'BTC', name: 'Bitcoin' }]);
  });

  it('keeps USDT while blocking ambiguous MOVE from ordinary title text', () => {
    const ctx = buildNewsCoinDerivationContext(baseAssets, [
      { symbol: 'USDT', name: 'USDT', keywords: ['usdt'] },
      { symbol: 'MOVE', name: 'MOVE', keywords: ['move'] },
    ]);

    const result = deriveNewsArticleCoins(
      {
        title: 'USDT Whale Transfer: Massive 200 Million Dollar Move to Binance Sparks Market Speculation',
      },
      ctx
    );

    expect(result.coins).toEqual([{ symbol: 'USDT', name: 'USDT' }]);
  });

  it('blocks ambiguous title-only matches but allows them when corroborated by API tickers', () => {
    const ctx = buildNewsCoinDerivationContext(baseAssets, [
      { symbol: 'TRUMP', name: 'TRUMP', keywords: ['trump'] },
    ]);

    const withoutCorroboration = deriveNewsArticleCoins(
      { title: 'Trump rallies again after campaign headline' },
      ctx
    );
    expect(withoutCorroboration.coins).toEqual([]);

    const withCorroboration = deriveNewsArticleCoins(
      { title: 'Trump rallies again after campaign headline', apiTickers: ['TRUMP'] },
      ctx
    );
    expect(withCorroboration.coins).toEqual([{ symbol: 'TRUMP', name: 'TRUMP' }]);
  });

  it('accepts API ticker-only matches even when the title is weak', () => {
    const ctx = buildNewsCoinDerivationContext(['BTC'], []);

    const result = deriveNewsArticleCoins(
      { title: 'Macro market update', apiTickers: ['BTC'] },
      ctx
    );

    expect(result.coins).toEqual([{ symbol: 'BTC', name: 'BTC' }]);
  });

  it('filters out symbols that are not in the tracked base-asset allowlist', () => {
    const ctx = buildNewsCoinDerivationContext(['ETH'], [
      { symbol: 'BTC', name: 'Bitcoin', keywords: ['bitcoin'] },
    ]);

    const result = deriveNewsArticleCoins(
      { title: 'Bitcoin may hit new highs', apiTickers: ['BTC'], categories: ['BTC'] },
      ctx
    );

    expect(result.coins).toEqual([]);
  });
});
