import { featureExists } from './featureValidator';

jest.mock('./feature.model', () => ({
  Feature: {
    countDocuments: jest.fn(),
  },
}));

import { Feature } from './feature.model';

describe('featureValidator', () => {
  const mockExec = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (Feature.countDocuments as jest.Mock).mockReturnValue({
      exec: mockExec,
    });
  });

  describe('featureExists', () => {
    it('returns true when feature exists', async () => {
      mockExec.mockResolvedValue(1);
      const result = await featureExists('rewards');
      expect(result).toBe(true);
      expect(Feature.countDocuments).toHaveBeenCalledWith({ key: 'rewards' });
    });

    it('returns false when feature does not exist', async () => {
      mockExec.mockResolvedValue(0);
      const result = await featureExists('nonexistent');
      expect(result).toBe(false);
    });
  });
});
