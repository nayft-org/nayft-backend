import crypto from 'crypto';
import { PortfolioWebhookIdempotency } from '../models/PortfolioWebhookIdempotency';
import { portfolioRepository } from '../repository';
import { verifyZerionWebhook } from '../zerionSignature';

describe('portfolioRepository.claimWebhookIdempotencyKey', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns true on first insert and false on duplicate key (11000)', async () => {
    const create = jest
      .spyOn(PortfolioWebhookIdempotency, 'create')
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }));

    await expect(portfolioRepository.claimWebhookIdempotencyKey('dedupe-test-key', 'alchemy')).resolves.toBe(
      true
    );
    await expect(portfolioRepository.claimWebhookIdempotencyKey('dedupe-test-key', 'alchemy')).resolves.toBe(
      false
    );
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('rethrows non-duplicate errors', async () => {
    jest.spyOn(PortfolioWebhookIdempotency, 'create').mockRejectedValueOnce(new Error('connection failed'));
    await expect(portfolioRepository.claimWebhookIdempotencyKey('x', 'zerion')).rejects.toThrow(
      'connection failed'
    );
  });
});

describe('verifyZerionWebhook', () => {
  it('returns false when required headers are missing', async () => {
    const raw = Buffer.from('{}', 'utf8');
    await expect(verifyZerionWebhook(raw, {})).resolves.toBe(false);
  });
});

describe('Alchemy HMAC (same contract as webhookController)', () => {
  function verifyAlchemySignature(rawBody: Buffer, signature: string, signingKey: string): boolean {
    const hmac = crypto.createHmac('sha256', signingKey);
    hmac.update(rawBody.toString('utf8'));
    const digest = hmac.digest('hex');
    return digest === signature;
  }

  it('rejects wrong signature when key is configured', () => {
    const raw = Buffer.from('{"type":"ADDRESS_ACTIVITY"}', 'utf8');
    const key = 'whsec_test';
    const badSig = 'deadbeef';
    expect(verifyAlchemySignature(raw, badSig, key)).toBe(false);
  });

  it('accepts correct HMAC-SHA256 hex signature', () => {
    const raw = Buffer.from('{"hello":"world"}', 'utf8');
    const key = 'whsec_test';
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(raw.toString('utf8'));
    const good = hmac.digest('hex');
    expect(verifyAlchemySignature(raw, good, key)).toBe(true);
  });
});
