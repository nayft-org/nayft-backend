/**
 * Seed plans collection if empty.
 * Run: cd crypto-backend && npx ts-node --transpile-only scripts/seed-plans.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Plan } from '../src/core/plans.model';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27018/crypto_db';

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

async function main() {
  await mongoose.connect(MONGO_URI);
  const count = await Plan.countDocuments().exec();
  if (count > 0) {
    console.log(`Plans already seeded (${count} documents). Skipping.`);
    await mongoose.disconnect();
    return;
  }
  await Plan.insertMany(DEFAULT_PLANS);
  console.log('Seeded', DEFAULT_PLANS.length, 'plans');
  await mongoose.disconnect();
}

main().catch(console.error);
