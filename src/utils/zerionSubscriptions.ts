import axios from 'axios';
import { config } from '../config/env';

// Maps our chain IDs → Zerion chain ID format
const CHAIN_TO_ZERION: Record<string, string> = {
  eth:     'ethereum',
  polygon: 'polygon',
  bnb:     'binance-smart-chain',
  arb:     'arbitrum',
  opt:     'optimism',
  base:    'base',
};

// Reuse the same Basic auth pattern as zerion.ts
function buildAuthHeader(): string {
  const encoded = Buffer.from(`${config.zerionApiKey}:`).toString('base64');
  return `Basic ${encoded}`;
}

const client = axios.create({
  baseURL: config.zerionBaseUrl, // https://api.zerion.io/v1
  headers: {
    accept:        'application/json',
    'content-type': 'application/json',
    Authorization: buildAuthHeader(),
  },
});

export const zerionSubscriptions = {
  /**
   * Creates a new tx-subscription and returns the subscription ID.
   * The callbackUrl must be publicly reachable (e.g. Cloudflare tunnel URL).
   * Dev keys: 1 subscription, max 5 wallets, 1-week validity.
   */
  async createSubscription(
    addresses:   string[],
    callbackUrl: string,
    chainIds:    string[] = []
  ): Promise<string> {
    const zerionChainIds = chainIds
      .map((c) => CHAIN_TO_ZERION[c.toLowerCase()])
      .filter(Boolean);

    const response = await client.post<{ data: { id: string } }>('/tx-subscriptions/', {
      addresses,
      callback_url: callbackUrl,
      ...(zerionChainIds.length > 0 ? { chain_ids: zerionChainIds } : {}),
    });

    const id = response.data?.data?.id;
    if (!id) throw new Error('[ZerionSubscriptions] createSubscription: missing ID in response');

    console.log(`[ZerionSubscriptions] Created subscription ${id}. Save ZERION_SUBSCRIPTION_ID=${id} in .env`);
    return id;
  },

  /**
   * Adds or removes wallet addresses from an existing subscription.
   * PATCH /v1/tx-subscriptions/{id}/wallets
   */
  async patchWallets(
    subscriptionId: string,
    toAdd:          string[],
    toRemove:       string[]
  ): Promise<void> {
    if (!subscriptionId) {
      console.warn('[ZerionSubscriptions] patchWallets: no subscriptionId — skipping');
      return;
    }
    const ops = [
      ...toAdd.map((addr)    => ({ op: 'add',    value: addr })),
      ...toRemove.map((addr) => ({ op: 'remove', value: addr })),
    ];
    if (ops.length === 0) return;
    await client.patch(`/tx-subscriptions/${subscriptionId}/wallets`, { data: ops });
  },

  /**
   * Updates the callback URL on an existing subscription.
   * Used when the Cloudflare tunnel URL changes on restart.
   * PATCH /v1/tx-subscriptions/{id}/callback_url
   */
  async updateCallbackUrl(subscriptionId: string, callbackUrl: string): Promise<void> {
    if (!subscriptionId) return;
    await client.patch(`/tx-subscriptions/${subscriptionId}/callback_url`, {
      data: { callback_url: callbackUrl },
    });
  },

  /**
   * Ensures a subscription exists. If ZERION_SUBSCRIPTION_ID is not set in config,
   * creates one and logs the ID. Returns the subscription ID.
   */
  async ensureSubscription(addresses: string[], chainIds: string[] = []): Promise<string> {
    if (config.zerionSubscriptionId) return config.zerionSubscriptionId;

    const callbackUrl = `${config.webhookBaseUrl}/api/portfolio/webhooks/zerion`;
    return this.createSubscription(addresses, callbackUrl, chainIds);
  },
};
