import {
  getExplorerTxUrlForChain,
  getSelectablePortfolioChains,
  normalizePortfolioAddress,
  resolvePortfolioChain,
  validatePortfolioChainSelection,
} from '../chainRegistry';

describe('portfolio chain registry', () => {
  it('derives selectable chains from non-empty Alchemy webhook IDs in registry order', () => {
    const chains = getSelectablePortfolioChains(
      JSON.stringify({
        sol: 'wh_sol',
        eth: 'wh_eth',
        polygon: 'wh_polygon',
        unknown: 'wh_unknown',
        bnb: 'wh_bnb',
        arb: 'wh_arb',
      }),
      'eth,polygon,bnb',
      jest.fn()
    );

    expect(chains.map((chain) => chain.id)).toEqual(['eth', 'polygon', 'bnb', 'arb', 'sol']);
  });

  it('falls back to SUPPORTED_CHAINS only when no webhook IDs are active', () => {
    const chains = getSelectablePortfolioChains(
      JSON.stringify({ eth: '', polygon: '', bnb: '' }),
      'bnb,polygon,eth',
      jest.fn()
    );

    expect(chains.map((chain) => chain.id)).toEqual(['eth', 'polygon', 'bnb']);
  });

  it('warns and ignores unknown active webhook keys', () => {
    const warn = jest.fn();
    const chains = getSelectablePortfolioChains(
      JSON.stringify({ eth: 'wh_eth', fantom: 'wh_ftm' }),
      '',
      warn
    );

    expect(chains.map((chain) => chain.id)).toEqual(['eth']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('fantom'));
  });

  it('normalizes EVM addresses and preserves Solana address case', () => {
    expect(normalizePortfolioAddress(' 0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD ', 'evm')).toBe(
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    );
    expect(normalizePortfolioAddress(' 7zQ3Rk9qN6LxVb2tP8sYaBcDeFgHiJkLmNoPqRsTuVw ', 'solana')).toBe(
      '7zQ3Rk9qN6LxVb2tP8sYaBcDeFgHiJkLmNoPqRsTuVw'
    );
  });

  it('rejects mixed EVM and Solana chain selections', () => {
    const selectable = getSelectablePortfolioChains(
      JSON.stringify({ eth: 'wh_eth', sol: 'wh_sol' }),
      '',
      jest.fn()
    );

    expect(() => validatePortfolioChainSelection(['eth', 'sol'], selectable)).toThrow(
      'Solana must be monitored as its own wallet entry'
    );
  });

  it('resolves Arbitrum and Solana network aliases and builds Solscan URLs', () => {
    expect(resolvePortfolioChain('ARB_MAINNET')?.id).toBe('arb');
    expect(resolvePortfolioChain('arb-mainnet')?.id).toBe('arb');
    expect(resolvePortfolioChain('SOLANA_MAINNET')?.id).toBe('sol');
    expect(resolvePortfolioChain('solana-mainnet')?.id).toBe('sol');
    expect(getExplorerTxUrlForChain('sol', '5nSig')).toBe('https://solscan.io/tx/5nSig');
  });
});
