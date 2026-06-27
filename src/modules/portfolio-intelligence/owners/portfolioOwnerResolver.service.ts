import { PortfolioOwner, type PortfolioOwnerType } from '../models/PortfolioOwner';

export const portfolioOwnerResolver = {
  async resolveForUser(userId: string): Promise<{ ownerId: string; ownerType: PortfolioOwnerType }> {
    const existing = await PortfolioOwner.findOne({ userId }).lean();
    if (existing) {
      return { ownerId: existing.ownerId, ownerType: existing.ownerType };
    }

    const ownerId = `user:${userId}`;
    await PortfolioOwner.findOneAndUpdate(
      { ownerId },
      {
        $setOnInsert: {
          ownerId,
          ownerType: 'user',
          userId,
          benchmarkParticipation: true,
        },
      },
      { upsert: true }
    );

    return { ownerId, ownerType: 'user' };
  },

  async resolveOwnerId(userId: string): Promise<string> {
    const { ownerId } = await this.resolveForUser(userId);
    return ownerId;
  },
};
