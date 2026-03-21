import { featureService } from './feature.service';

let mockFindOneResult: unknown = null;

jest.mock('./feature.model', () => ({
  Feature: {
    find: jest.fn(),
    findOne: jest.fn().mockImplementation(() => ({
      lean: () => ({
        exec: () => Promise.resolve(mockFindOneResult),
      }),
    })),
    findOneAndUpdate: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

jest.mock('../../config/redis', () => ({
  cacheHelpers: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('./featureAudit.model', () => ({
  FeatureAuditLog: {
    insertMany: jest.fn().mockResolvedValue([]),
  },
}));

describe('featureService.isEnabled', () => {
  beforeEach(() => {
    mockFindOneResult = null;
  });

  it('returns false for non-existent feature', async () => {
    mockFindOneResult = null;
    const result = await featureService.isEnabled('nonexistent');
    expect(result).toBe(false);
  });

  it('throws for critical missing feature (auth)', async () => {
    mockFindOneResult = null;
    await expect(featureService.isEnabled('auth')).rejects.toThrow(
      'Critical feature disabled or missing'
    );
  });

  it('throws for critical missing feature (system)', async () => {
    mockFindOneResult = null;
    await expect(featureService.isEnabled('system')).rejects.toThrow(
      'Critical feature disabled or missing'
    );
  });

  it('returns true when feature exists and is active', async () => {
    mockFindOneResult = {
      key: 'rewards',
      isActive: true,
      controllable: true,
    };
    const result = await featureService.isEnabled('rewards');
    expect(result).toBe(true);
  });

  it('returns false when feature exists but is inactive', async () => {
    mockFindOneResult = {
      key: 'rewards',
      isActive: false,
      controllable: true,
    };
    const result = await featureService.isEnabled('rewards');
    expect(result).toBe(false);
  });
});
