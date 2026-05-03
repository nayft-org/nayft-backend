import { createHmac } from 'crypto';
import axios from 'axios';
import { coindcxService } from './coindcxService';
import { CoindcxApiError } from './coindcxErrors';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

jest.mock('./coindcxRateLimiter', () => ({
  coindcxRateLimiter: { acquire: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../config/env', () => ({
  config: {
    coindcxBaseUrl: 'https://api.coindcx.com',
    coindcxHttpTimeoutMs: 25000,
  },
}));

const creds = { apiKey: 'ak_test_1234', apiSecret: 'sk_test_secret' };

function expectedHexForBody(secret: string, body: Record<string, unknown>): string {
  return createHmac('sha256', secret).update(JSON.stringify(body), 'utf8').digest('hex');
}

describe('coindcxService.signPayload (HMAC-SHA256 golden vectors)', () => {
  it('signed payload matches Node crypto for timestamp-only body', () => {
    const body = { timestamp: 1700000000000 };
    const hex = coindcxService.signPayload('my_secret', body);
    expect(hex).toBe(expectedHexForBody('my_secret', body));
  });

  it('key insertion order changes the signature (must match the object sent on the wire)', () => {
    const secret = 's';
    const a = { timestamp: 1, b: 2, a: 3 };
    const b = { a: 3, b: 2, timestamp: 1 };
    expect(coindcxService.signPayload(secret, a)).not.toBe(coindcxService.signPayload(secret, b));
  });

  it('includes nested + trade_history-style fields in canonical form', () => {
    const body = { from_id: 'x', sort: 'asc', timestamp: 99 };
    const hex = coindcxService.signPayload(creds.apiSecret, body);
    expect(hex).toBe(expectedHexForBody(creds.apiSecret, body));
  });
});

describe('coindcxService HTTP calls (axios)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (axios.post as jest.Mock).mockResolvedValue({ data: [] });
  });

  it('getBalances posts to /users/balances with HMAC over body including timestamp', async () => {
    await coindcxService.getBalances(creds);
    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body, options] = (axios.post as jest.Mock).mock.calls[0];
    expect(String(url)).toContain('/exchange/v1/users/balances');
    const b = body as Record<string, unknown>;
    expect(b).toHaveProperty('timestamp');
    expect(typeof b.timestamp).toBe('number');
    const signature = (options.headers as Record<string, string>)['X-AUTH-SIGNATURE'];
    expect(signature).toBe(coindcxService.signPayload(creds.apiSecret, b as Record<string, unknown>));
    expect((options.headers as Record<string, string>)['X-AUTH-APIKEY']).toBe(creds.apiKey);
  });

  it('getUserInfo uses /users/info', async () => {
    (axios.post as jest.Mock).mockResolvedValue({ data: { id: 1 } });
    const info = await coindcxService.getUserInfo(creds);
    const [url] = (axios.post as jest.Mock).mock.calls[0];
    expect(String(url)).toContain('/exchange/v1/users/info');
    expect(info).toEqual({ id: 1 });
  });

  it('getTradeHistoryPage forwards from_id, sort, and signs full body', async () => {
    (axios.post as jest.Mock).mockResolvedValue({ data: [{ id: '1' }] });
    const page = await coindcxService.getTradeHistoryPage(creds, {
      fromId: 'abc',
      sort: 'asc',
      limit: 50,
    });
    const [, body] = (axios.post as jest.Mock).mock.calls[0];
    const b = body as Record<string, unknown>;
    expect(b.from_id).toBe('abc');
    expect(b.sort).toBe('asc');
    expect(b.limit).toBe(50);
    const sig = ((axios.post as jest.Mock).mock.calls[0][2].headers as Record<string, string>)[
      'X-AUTH-SIGNATURE'
    ];
    expect(sig).toBe(coindcxService.signPayload(creds.apiSecret, b as Record<string, unknown>));
    expect(page).toEqual([{ id: '1' }]);
  });

  it('maps axios 401 to CoindcxApiError', async () => {
    (axios.post as jest.Mock).mockRejectedValue({ response: { status: 401 } });
    await expect(coindcxService.getBalances(creds)).rejects.toBeInstanceOf(CoindcxApiError);
  });
});
