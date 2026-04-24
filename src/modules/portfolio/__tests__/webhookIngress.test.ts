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

describe('Alchemy activity dedupe fingerprint', () => {
  function normalizeActivityPart(value: unknown): string {
    if (value == null) return '';
    return String(value).trim().toLowerCase();
  }

  function alchemyActivityFingerprint(activity: Record<string, any>): string {
    const rawContract = activity.rawContract ?? {};
    const parts = [
      normalizeActivityPart(activity.hash),
      normalizeActivityPart(activity.category),
      normalizeActivityPart(activity.asset),
      normalizeActivityPart(activity.fromAddress),
      normalizeActivityPart(activity.toAddress),
      normalizeActivityPart(activity.value),
      normalizeActivityPart(activity.blockNum),
      normalizeActivityPart(rawContract.address),
      normalizeActivityPart(rawContract.decimal),
      normalizeActivityPart(activity.logIndex),
      normalizeActivityPart(activity.uniqueId),
    ];
    return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
  }

  it('keeps distinct native and ERC-20 activities from the same tx hash separate', () => {
    const base = {
      hash: '0xtx1',
      fromAddress: '0xaaa',
      toAddress: '0xbbb',
      blockNum: '0x123',
    };

    const nativeFingerprint = alchemyActivityFingerprint({
      ...base,
      category: 'external',
      asset: 'MATIC',
      value: '0.01',
    });

    const erc20Fingerprint = alchemyActivityFingerprint({
      ...base,
      category: 'erc20',
      asset: 'USDC',
      value: '25',
      rawContract: {
        address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        decimal: '6',
      },
    });

    expect(nativeFingerprint).not.toBe(erc20Fingerprint);
  });

  it('produces the same fingerprint for duplicate webhook retries of the same activity', () => {
    const activity = {
      hash: '0xtx2',
      category: 'erc20',
      asset: 'USDC',
      value: '10',
      blockNum: '0x456',
      fromAddress: '0x111',
      toAddress: '0x222',
      rawContract: {
        address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        decimal: '6',
      },
    };

    expect(alchemyActivityFingerprint(activity)).toBe(alchemyActivityFingerprint({ ...activity }));
  });
});
