/** Chain ID → block explorer base URL for transaction links */
const CHAIN_EXPLORER_MAP: Record<string, string> = {
  eth:       'https://etherscan.io/tx/',
  polygon:   'https://polygonscan.com/tx/',
  matic:     'https://polygonscan.com/tx/',
  bnb:       'https://bscscan.com/tx/',
  bsc:       'https://bscscan.com/tx/',
  arb:       'https://arbiscan.io/tx/',
  opt:       'https://optimistic.etherscan.io/tx/',
  base:      'https://basescan.org/tx/',
};

function normalizeChain(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'matic' || c === '137' || c.startsWith('chain_137')) return 'polygon';
  if (c === 'bsc' || c === '56' || c.startsWith('chain_56')) return 'bnb';
  if (c === 'eth' || c === '1' || c.startsWith('chain_1')) return 'eth';
  return c;
}

/**
 * Returns the block explorer URL for a transaction on the given chain.
 * e.g. getExplorerTxUrl('eth', '0x123...') → 'https://etherscan.io/tx/0x123...'
 */
export function getExplorerTxUrl(chain: string, txHash: string): string {
  if (!txHash) return '';
  const base = CHAIN_EXPLORER_MAP[normalizeChain(chain)];
  if (!base) return '';
  return `${base}${txHash}`;
}
