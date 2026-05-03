import { CoindcxApiError, mapAxiosError } from './coindcxErrors';

describe('mapAxiosError', () => {
  it('maps 401 to invalid_credentials', () => {
    const e = mapAxiosError({ response: { status: 401 } });
    expect(e).toBeInstanceOf(CoindcxApiError);
    expect(e.code).toBe('invalid_credentials');
    expect(e.status).toBe(401);
  });

  it('maps 403 to invalid_credentials', () => {
    const e = mapAxiosError({ response: { status: 403 } });
    expect(e.code).toBe('invalid_credentials');
  });

  it('maps 429 to rate_limited with optional Retry-After', () => {
    const e = mapAxiosError({
      response: { status: 429, headers: { 'retry-after': '2' } },
    });
    expect(e.code).toBe('rate_limited');
    expect(e.retryAfterMs).toBe(2000);
  });

  it('maps 5xx to provider_error', () => {
    const e = mapAxiosError({ response: { status: 503 } });
    expect(e.code).toBe('provider_error');
  });

  it('passes through CoindcxApiError', () => {
    const orig = new CoindcxApiError('x', 'network');
    expect(mapAxiosError(orig)).toBe(orig);
  });
});
