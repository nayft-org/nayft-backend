import axios from 'axios';
import { config } from '../config/env';
import { claimAlchemyRpcBudget } from '../services/alchemyRpcBudget';

// Alchemy network identifiers mapped from chain config IDs
const CHAIN_NETWORK_MAP: Record<string, string> = {
  eth:       'eth-mainnet',
  polygon:   'polygon-mainnet',
  matic:     'polygon-mainnet',
  bnb:       'bnb-mainnet',
  bsc:       'bnb-mainnet',
  arb:       'arb-mainnet',
  opt:       'opt-mainnet',
  base:      'base-mainnet',
};

// Public RPC fallbacks when Alchemy doesn't support the chain (e.g. network not enabled)
const PUBLIC_RPC_FALLBACK: Record<string, string> = {
  eth:       'https://eth.llamarpc.com',
  polygon:   'https://1rpc.io/matic',
  matic:     'https://1rpc.io/matic',
  bnb:       'https://bsc-dataseed.binance.org',
  bsc:       'https://bsc-dataseed.binance.org',
  arb:       'https://arb1.arbitrum.io/rpc',
  opt:       'https://mainnet.optimism.io',
  base:      'https://mainnet.base.org',
};

function getNetworkPath(chain: string): string {
  return CHAIN_NETWORK_MAP[chain.toLowerCase()] ?? chain;
}

function getChainForFallback(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'matic' || c === '137' || c.startsWith('chain_137')) return 'polygon';
  if (c === 'bsc' || c === '56' || c.startsWith('chain_56')) return 'bnb';
  if (c === 'eth' || c === '1' || c.startsWith('chain_1')) return 'eth';
  return CHAIN_NETWORK_MAP[c] ? c : chain;
}

function buildClient(chain: string) {
  const network = getNetworkPath(chain);
  console.log('[AlchemyApi] buildClient', { chain, network });
  return axios.create({
    baseURL: `https://${network}.g.alchemy.com/v2/${config.alchemyApiKey}`,
    headers: { accept: 'application/json', 'content-type': 'application/json' },
  });
}

export interface AlchemyTransfer {
  hash:          string;
  from:          string;
  to:            string | null;
  value:         string | null;
  asset:         string | null;
  category:      string;
  blockNum:      string;
  uniqueId:      string;
  metadata: {
    blockTimestamp: string;
  };
}

export interface AlchemyTokenBalance {
  contractAddress: string;
  tokenBalance:    string | null;
}

export const alchemyApi = {
  /**
   * Returns transfers for a given wallet address on the specified chain.
   * Uses the Alchemy Transfers API (alchemy_getAssetTransfers).
   */
  getAssetTransfers: async (
    address: string,
    chain: string,
    fromBlock: string = '0x0'
  ): Promise<AlchemyTransfer[]> => {
    const budget = await claimAlchemyRpcBudget('alchemy_getAssetTransfers');
    if (!budget.allowed) {
      console.warn('[AlchemyApi] getAssetTransfers denied by budget', {
        chain,
        address: address.toLowerCase(),
        reason: budget.reason,
        count: budget.count,
        limit: budget.limit,
        key: budget.key,
      });
      return [];
    }

    const client = buildClient(chain);
    console.log('[AlchemyApi] getAssetTransfers start', {
      chain,
      network: getNetworkPath(chain),
      address: address.toLowerCase(),
      fromBlock,
    });
    const response = await client.post<{
      result: { transfers: AlchemyTransfer[] };
    }>('', {
      id:      1,
      jsonrpc: '2.0',
      method:  'alchemy_getAssetTransfers',
      params:  [
        {
          fromBlock,
          toBlock:       'latest',
          toAddress:     address,
          withMetadata:  true,
          excludeZeroValue: true,
          maxCount:      '0x32', // 50 results
          category:      ['external', 'erc20', 'erc721', 'erc1155'],
        },
      ],
    });
    const transfers = response.data?.result?.transfers ?? [];
    console.log('[AlchemyApi] getAssetTransfers success', {
      chain,
      address: address.toLowerCase(),
      transfers: transfers.length,
    });
    return transfers;
  },

  /**
   * Fetches transaction receipt via eth_getTransactionReceipt.
   * Tries Alchemy first; falls back to public RPC when Alchemy doesn't support the chain.
   * Returns status: 0x1=success, 0x0=failed, null=not mined yet.
   * Returns null on error.
   */
  getTransactionReceipt: async (
    txHash: string,
    chain: string
  ): Promise<{ status: '0x0' | '0x1' | null } | null> => {
    if (!txHash?.trim()) return null;
    const budget = await claimAlchemyRpcBudget('eth_getTransactionReceipt');
    if (!budget.allowed) {
      console.warn('[AlchemyApi] getTransactionReceipt denied by budget', {
        chain,
        txHash,
        reason: budget.reason,
        count: budget.count,
        limit: budget.limit,
        key: budget.key,
      });
      return null;
    }

    const normalizedHash = txHash.trim().startsWith('0x') ? txHash.trim() : `0x${txHash.trim()}`;
    const normalizedChain = getChainForFallback(chain);

    const parseStatus = (result: { status?: string | number } | null): { status: '0x0' | '0x1' | null } | null => {
      if (!result) return { status: null };
      const s = result.status;
      if (s === '0x1' || s === 1) return { status: '0x1' };
      if (s === '0x0' || s === 0) return { status: '0x0' };
      return { status: null };
    };

    const fetchReceipt = async (baseURL: string): Promise<{ status: '0x0' | '0x1' | null } | null> => {
      const client = axios.create({
        baseURL,
        headers: { accept: 'application/json', 'content-type': 'application/json' },
      });
      const response = await client.post<{
        result?: { status?: string | number } | null;
        error?: { message?: string };
      }>('', {
        id:      1,
        jsonrpc: '2.0',
        method:  'eth_getTransactionReceipt',
        params:  [normalizedHash],
      });
      if (response.data?.error) return null;
      return parseStatus(response.data?.result ?? null);
    };

    // Try Alchemy first (when API key is set)
    if (config.alchemyApiKey) {
      try {
        console.log('[AlchemyApi] getTransactionReceipt start', {
          chain: normalizedChain,
          txHash: normalizedHash,
          source: 'alchemy',
        });
        const result = await fetchReceipt(
          `https://${getNetworkPath(normalizedChain)}.g.alchemy.com/v2/${config.alchemyApiKey}`
        );
        if (result !== null) return result;
      } catch (err) {
        console.warn(`[Alchemy] getTransactionReceipt failed for ${normalizedChain}, trying fallback:`, (err as Error).message);
      }
    }

    // Fallback to public RPC
    const fallbackUrl = PUBLIC_RPC_FALLBACK[normalizedChain];
    if (fallbackUrl) {
      try {
        console.log('[AlchemyApi] getTransactionReceipt fallback start', {
          chain: normalizedChain,
          txHash: normalizedHash,
          source: fallbackUrl,
        });
        const result = await fetchReceipt(fallbackUrl);
        if (result !== null) return result;
      } catch (err) {
        console.warn(`[Alchemy] Public RPC fallback failed for ${normalizedChain}:`, (err as Error).message);
      }
    }

    return null;
  },

  /**
   * Returns ERC-20 token balances for a wallet on the specified chain.
   */
  getTokenBalances: async (
    address: string,
    chain: string
  ): Promise<AlchemyTokenBalance[]> => {
    const budget = await claimAlchemyRpcBudget('alchemy_getTokenBalances');
    if (!budget.allowed) {
      console.warn('[AlchemyApi] getTokenBalances denied by budget', {
        chain,
        address: address.toLowerCase(),
        reason: budget.reason,
        count: budget.count,
        limit: budget.limit,
        key: budget.key,
      });
      return [];
    }

    const client = buildClient(chain);
    console.log('[AlchemyApi] getTokenBalances start', {
      chain,
      network: getNetworkPath(chain),
      address: address.toLowerCase(),
    });
    const response = await client.post<{
      result: { tokenBalances: AlchemyTokenBalance[] };
    }>('', {
      id:      1,
      jsonrpc: '2.0',
      method:  'alchemy_getTokenBalances',
      params:  [address, 'erc20'],
    });
    const balances = response.data?.result?.tokenBalances ?? [];
    console.log('[AlchemyApi] getTokenBalances success', {
      chain,
      address: address.toLowerCase(),
      balances: balances.length,
    });
    return balances;
  },
};
