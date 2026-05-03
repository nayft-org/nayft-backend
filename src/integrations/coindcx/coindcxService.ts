import axios from 'axios';
import { createHmac } from 'crypto';
import { config } from '../../config/env';
import { CoindcxApiError, mapAxiosError } from './coindcxErrors';
import { coindcxRateLimiter } from './coindcxRateLimiter';

export interface CoindcxCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface NormalizedBalance {
  asset: string;
  free: number;
  locked: number;
}

export interface TradeHistoryParams {
  fromId?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
  symbol?: string;
  sort?: 'asc' | 'desc';
  limit?: number;
}

/**
 * HMAC the exact JSON string the server receives. CoinDCX (like Python `json.dumps`) uses
 * object insertion order, not sorted keys; `stableStringify` would not match `axios`/`JSON.stringify`.
 */
function signPayload(secret: string, body: Record<string, unknown>): string {
  const payload = JSON.stringify(body);
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

async function postJson<T>(
  path: string,
  creds: CoindcxCredentials,
  body: Record<string, unknown>
): Promise<T> {
  await coindcxRateLimiter.acquire(creds.apiKey);
  const timestamp = Date.now();
  const jsonBody: Record<string, unknown> = { ...body, timestamp };
  const signature = signPayload(creds.apiSecret, jsonBody);
  const url = `${config.coindcxBaseUrl.replace(/\/$/, '')}${path}`;
  try {
    const res = await axios.post<T>(url, jsonBody, {
      timeout: config.coindcxHttpTimeoutMs,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-AUTH-APIKEY': creds.apiKey,
        'X-AUTH-SIGNATURE': signature,
      },
    });
    return res.data;
  } catch (e) {
    throw mapAxiosError(e);
  }
}

function asNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function normalizeBalancesPayload(data: unknown): NormalizedBalance[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.map((row) => {
      const r = row as Record<string, unknown>;
      const asset = String(r.currency ?? r.asset ?? r.coin ?? '').toUpperCase();
      return {
        asset,
        free: asNumber(r.balance ?? r.available_balance ?? r.free),
        locked: asNumber(r.locked_balance ?? r.locked ?? r.lockedBalance),
      };
    }).filter((b) => b.asset.length > 0);
  }
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const obj = data as Record<string, Record<string, unknown>>;
    return Object.entries(obj).map(([currency, row]) => ({
      asset: currency.toUpperCase(),
      free: asNumber(row?.balance ?? row?.available_balance),
      locked: asNumber(row?.locked_balance ?? row?.locked),
    }));
  }
  return [];
}

export const coindcxService = {
  signPayload,

  async getBalances(creds: CoindcxCredentials): Promise<NormalizedBalance[]> {
    const raw = await postJson<unknown>('/exchange/v1/users/balances', creds, {});
    return normalizeBalancesPayload(raw);
  },

  async getUserInfo(creds: CoindcxCredentials): Promise<Record<string, unknown>> {
    const raw = await postJson<Record<string, unknown>>('/exchange/v1/users/info', creds, {});
    return raw ?? {};
  },

  /**
   * Fetches one page of trades. Caller paginates with from_id / timestamps.
   */
  async getTradeHistoryPage(
    creds: CoindcxCredentials,
    params: TradeHistoryParams
  ): Promise<Record<string, unknown>[]> {
    const body: Record<string, unknown> = {};
    if (params.fromId) body.from_id = params.fromId;
    if (params.fromTimestamp != null) body.from_timestamp = params.fromTimestamp;
    if (params.toTimestamp != null) body.to_timestamp = params.toTimestamp;
    if (params.symbol) body.symbol = params.symbol;
    if (params.sort) body.sort = params.sort;
    if (params.limit != null) body.limit = params.limit;

    const raw = await postJson<unknown>('/exchange/v1/orders/trade_history', creds, body);
    if (Array.isArray(raw)) return raw as Record<string, unknown>[];
    if (raw && typeof raw === 'object' && Array.isArray((raw as { trades?: unknown }).trades)) {
      return (raw as { trades: Record<string, unknown>[] }).trades;
    }
    if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)) {
      return (raw as { data: Record<string, unknown>[] }).data;
    }
    throw new CoindcxApiError('Unexpected trade_history response shape', 'bad_response');
  },

  /** Validates credentials by calling users/info. */
  async validateCredentials(creds: CoindcxCredentials): Promise<void> {
    await this.getUserInfo(creds);
  },
};
