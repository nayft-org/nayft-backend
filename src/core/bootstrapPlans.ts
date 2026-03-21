import { Plan } from './plans.model';

const DEFAULT_PLANS = [
  {
    key: 'free',
    name: 'Free',
    description: 'Basic features for free users',
    featureKeys: ['news_feed', 'market_data'],
  },
  {
    key: 'premium',
    name: 'Premium',
    description: 'Extended features for power users',
    featureKeys: ['news_feed', 'market_data', 'portfolio_tracking', 'news_boards'],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    description: 'Full access for organizations',
    featureKeys: [
      'news_feed',
      'market_data',
      'portfolio_tracking',
      'news_boards',
      'unified_search',
      'charts',
      'coin_profiles',
    ],
  },
];

/**
 * Seeds the plans collection if empty. Idempotent — safe on server restart.
 */
export async function bootstrapPlans(): Promise<void> {
  const count = await Plan.countDocuments().exec();
  if (count > 0) {
    return;
  }

  await Plan.insertMany(DEFAULT_PLANS);
  console.log('[Plans] Seeded default plans');
}
