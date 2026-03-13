import axios from 'axios';
import { config } from '../config/env';

// Alchemy network identifiers mapped from chain config IDs
const CHAIN_NETWORK_MAP: Record<string, string> = {
  eth:     'eth-mainnet',
  polygon: 'polygon-mainnet',
  bnb:     'bnb-mainnet',
  arb:     'arb-mainnet',
  opt:     'opt-mainnet',
  base:    'base-mainnet',
};

function getNetworkPath(chain: string): string {
  return CHAIN_NETWORK_MAP[chain.toLowerCase()] ?? chain;
}

function buildClient(chain: string) {
  const network = getNetworkPath(chain);
  return axios.create({
    baseURL: `${config.alchemyBaseUrl}/v2/${config.alchemyApiKey}`,
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    // Alchemy's REST v3 uses network as a path segment; we embed it in the request
    params: { network },
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
    const client = buildClient(chain);
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
    return response.data?.result?.transfers ?? [];
  },

  /**
   * Returns ERC-20 token balances for a wallet on the specified chain.
   */
  getTokenBalances: async (
    address: string,
    chain: string
  ): Promise<AlchemyTokenBalance[]> => {
    const client = buildClient(chain);
    const response = await client.post<{
      result: { tokenBalances: AlchemyTokenBalance[] };
    }>('', {
      id:      1,
      jsonrpc: '2.0',
      method:  'alchemy_getTokenBalances',
      params:  [address, 'erc20'],
    });
    return response.data?.result?.tokenBalances ?? [];
  },
};
