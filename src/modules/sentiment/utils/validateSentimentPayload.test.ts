import { validateSentimentJobPayload } from './validateSentimentPayload';

describe('validateSentimentJobPayload', () => {
  const valid = {
    externalId: 'abc-123',
    contentHash: 'a'.repeat(32),
    queuedAt: new Date().toISOString(),
    attempt: 0,
  };

  it('accepts valid payload', () => {
    const result = validateSentimentJobPayload(JSON.stringify(valid));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.job.externalId).toBe('abc-123');
    }
  });

  it('rejects invalid external id', () => {
    const result = validateSentimentJobPayload(
      JSON.stringify({ ...valid, externalId: 'bad id!' })
    );
    expect(result.ok).toBe(false);
  });

  it('rejects invalid content hash', () => {
    const result = validateSentimentJobPayload(
      JSON.stringify({ ...valid, contentHash: 'short' })
    );
    expect(result.ok).toBe(false);
  });
});
