import axios from 'axios';
import { config } from '../config/env';

// Maps our chain IDs → Alchemy network names used by the Notify API
const CHAIN_TO_ALCHEMY_NETWORK: Record<string, string> = {
  eth:     'ETH_MAINNET',
  polygon: 'MATIC_MAINNET',
  bnb:     'BNB_MAINNET',
  arb:     'ARB_MAINNET',
  opt:     'OPT_MAINNET',
  base:    'BASE_MAINNET',
};

// Reverse: Alchemy network → our chain ID (built once from the forward map)
const ALCHEMY_NETWORK_TO_CHAIN: Record<string, string> = Object.fromEntries(
  Object.entries(CHAIN_TO_ALCHEMY_NETWORK).map(([chain, network]) => [network, chain])
);

// Parse JSON maps from env once per process
let _webhookIds: Record<string, string> | null = null;
let _signingKeys: Record<string, string> | null = null;

function getWebhookIds(): Record<string, string> {
  if (!_webhookIds) {
    try { _webhookIds = JSON.parse(config.alchemyWebhookIds); }
    catch { _webhookIds = {}; }
  }
  return _webhookIds!;
}

function getSigningKeys(): Record<string, string> {
  if (!_signingKeys) {
    try { _signingKeys = JSON.parse(config.alchemyWebhookSigningKeys); }
    catch { _signingKeys = {}; }
  }
  return _signingKeys!;
}

// Axios client for Alchemy Notify management API (different from the RPC client in alchemy.ts)
const notifyClient = axios.create({
  baseURL: config.alchemyNotifyBaseUrl,
  headers: {
    'Content-Type':    'application/json',
    'X-Alchemy-Token': config.alchemyAuthToken,
  },
});

export const alchemyNotify = {
  /**
   * Add or remove addresses from a specific Address Activity webhook.
   * PATCH {notifyBaseUrl}/update-webhook-addresses
   */
  async updateWebhookAddresses(
    webhookId: string,
    toAdd:     string[],
    toRemove:  string[]
  ): Promise<void> {
    await notifyClient.patch('/update-webhook-addresses', {
      webhook_id:          webhookId,
      addresses_to_add:    toAdd,
      addresses_to_remove: toRemove,
    });
  },

  /** Returns the webhook ID configured for the given chain, or null if not set. */
  getWebhookIdForChain(chain: string): string | null {
    return getWebhookIds()[chain.toLowerCase()] || null;
  },

  /** Returns the signing key configured for the given chain, or null if not set. */
  getSigningKeyForChain(chain: string): string | null {
    return getSigningKeys()[chain.toLowerCase()] || null;
  },

  /**
   * Converts an Alchemy network name (e.g. "ETH_MAINNET") back to our chain ID
   * (e.g. "eth"). Returns null if the network is not in the map.
   */
  getChainFromAlchemyNetwork(network: string): string | null {
    return ALCHEMY_NETWORK_TO_CHAIN[network] ?? null;
  },

  /** Returns the Alchemy network name for a given chain ID. */
  getAlchemyNetworkForChain(chain: string): string | null {
    return CHAIN_TO_ALCHEMY_NETWORK[chain.toLowerCase()] ?? null;
  },
};
