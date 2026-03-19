import { Feature } from './feature.model';

export interface FeatureFilter {
  module?: string;
  isActive?: boolean;
  category?: 'free' | 'premium' | 'enterprise';
}

export const featureService = {
  async getAll(filters?: FeatureFilter) {
    const query: Record<string, unknown> = {};
    if (filters?.module) query.module = filters.module;
    if (filters?.isActive !== undefined) query.isActive = filters.isActive;
    if (filters?.category) query.category = filters.category;

    return Feature.find(query).sort({ module: 1, key: 1 }).lean().exec();
  },

  async getByKey(key: string) {
    return Feature.findOne({ key }).lean().exec();
  },

  async isActive(key: string): Promise<boolean> {
    const f = await Feature.findOne({ key }).select('isActive').lean().exec();
    return f?.isActive ?? false;
  },

  async updateIsActive(key: string, isActive: boolean) {
    const f = await Feature.findOneAndUpdate(
      { key },
      { $set: { isActive, updatedAt: new Date() } },
      { new: true }
    )
      .lean()
      .exec();
    if (!f) throw new Error(`Feature not found: ${key}`);
    return f;
  },

  async delete(key: string) {
    const f = await Feature.findOneAndDelete({ key }).lean().exec();
    if (!f) throw new Error(`Feature not found: ${key}`);
    return f;
  },
};
