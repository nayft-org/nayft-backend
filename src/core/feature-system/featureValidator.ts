import { Feature } from './feature.model';

export async function featureExists(featureKey: string): Promise<boolean> {
  const count = await Feature.countDocuments({ key: featureKey }).exec();
  return count > 0;
}
