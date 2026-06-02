import { computeArticleContentHash } from './contentHash';

describe('computeArticleContentHash', () => {
  it('is stable for same normalized input', () => {
    const a = computeArticleContentHash('Bitcoin Rises', 'Markets are up');
    const b = computeArticleContentHash('  BITCOIN RISES  ', '  Markets are up  ');
    expect(a).toBe(b);
  });

  it('changes when subtitle changes', () => {
    const a = computeArticleContentHash('Title', 'One');
    const b = computeArticleContentHash('Title', 'Two');
    expect(a).not.toBe(b);
  });

  it('strips html before hashing', () => {
    const a = computeArticleContentHash('Title', '<p>Hello</p>');
    const b = computeArticleContentHash('Title', 'Hello');
    expect(a).toBe(b);
  });

  it('returns 32 hex characters', () => {
    expect(computeArticleContentHash('x', 'y')).toMatch(/^[a-f0-9]{32}$/);
  });
});
