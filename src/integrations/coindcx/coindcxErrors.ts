export type CoindcxErrorCode =
  | 'invalid_credentials'
  | 'rate_limited'
  | 'provider_error'
  | 'bad_response'
  | 'network';

export class CoindcxApiError extends Error {
  readonly code: CoindcxErrorCode;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(message: string, code: CoindcxErrorCode, status?: number, retryAfterMs?: number) {
    super(message);
    this.name = 'CoindcxApiError';
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export function mapAxiosError(err: unknown): CoindcxApiError {
  if (err instanceof CoindcxApiError) return err;
  const any = err as { response?: { status?: number; headers?: Record<string, string> }; message?: string };
  const status = any.response?.status;
  const retryAfter = any.response?.headers?.['retry-after'];
  const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
  if (status === 401 || status === 403) {
    return new CoindcxApiError('CoinDCX authentication failed', 'invalid_credentials', status);
  }
  if (status === 429) {
    return new CoindcxApiError('CoinDCX rate limited', 'rate_limited', status, retryAfterMs);
  }
  if (status && status >= 500) {
    return new CoindcxApiError('CoinDCX server error', 'provider_error', status);
  }
  return new CoindcxApiError(any.message || 'CoinDCX request failed', 'network', status);
}
