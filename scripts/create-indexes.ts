import mongoose from 'mongoose';

type IndexSpec = {
  collection: string;
  key: Record<string, 1 | -1>;
  options?: Record<string, unknown>;
};

const INDEX_SPECS: IndexSpec[] = [
  // Unified follow graph queries
  {
    collection: 'follows',
    key: { followerId: 1, targetType: 1, targetId: 1 },
    options: { unique: true, name: 'follower_target_unique' },
  },
  { collection: 'follows', key: { targetType: 1, targetId: 1 }, options: { name: 'target_lookup' } },
  {
    collection: 'follows',
    key: { targetType: 1, targetId: 1, createdAt: -1 },
    options: { name: 'target_created_desc' },
  },
  {
    collection: 'follows',
    key: { followerId: 1, targetType: 1, createdAt: -1 },
    options: { name: 'follower_created_desc' },
  },

  // News search + feeds
  { collection: 'newsarticles', key: { status: 1, publishedAt: -1 }, options: { name: 'status_published_desc' } },
  {
    collection: 'newsarticles',
    key: { status: 1, 'categories.key': 1, publishedAt: -1 },
    options: { name: 'status_category_published_desc' },
  },
  {
    collection: 'newsarticles',
    key: { status: 1, 'coins.symbol': 1, publishedAt: -1 },
    options: { name: 'status_coin_published_desc' },
  },
  { collection: 'newsarticles', key: { externalId: 1 }, options: { unique: true, name: 'external_id_unique' } },

  // User search
  { collection: 'users', key: { username: 1 }, options: { name: 'username_search' } },
  { collection: 'users', key: { usernameLower: 1 }, options: { sparse: true, name: 'username_lower_search' } },

  // Wishlists and board search
  { collection: 'wishlists', key: { userId: 1, coinId: 1 }, options: { unique: true, name: 'wishlist_unique' } },
  { collection: 'newsboards', key: { userId: 1, updatedAt: -1 }, options: { name: 'board_user_updated_desc' } },
  { collection: 'newsboards', key: { name: 1 }, options: { name: 'board_name_search' } },

  // Engagement search paths
  {
    collection: 'reactions',
    key: { userId: 1, targetType: 1, updatedAt: -1 },
    options: { name: 'reaction_user_target_updated_desc' },
  },
  { collection: 'comments', key: { userId: 1, createdAt: -1 }, options: { name: 'comment_user_created_desc' } },

  // Chart queries
  {
    collection: 'ohlcvklines',
    key: { 'meta.exchange': 1, 'meta.symbol': 1, 'meta.interval': 1, openTime: -1 },
    options: { name: 'kline_market_lookup' },
  },
  {
    collection: 'ohlcvklines',
    key: { 'meta.exchange': 1, 'meta.symbol': 1, 'meta.interval': 1, openTime: 1 },
    options: { unique: true, name: 'kline_market_open_unique' },
  },
  {
    collection: 'markettrades',
    key: { 'meta.exchange': 1, 'meta.symbol': 1, 'meta.dataType': 1, time: -1 },
    options: { name: 'trade_market_lookup' },
  },
  {
    collection: 'markettrades',
    key: { 'meta.exchange': 1, 'meta.symbol': 1, 'meta.dataType': 1, tradeId: 1 },
    options: { sparse: true, unique: true, name: 'trade_market_id_unique' },
  },
];

async function connectFromEnv(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) {
    throw new Error('Missing Mongo URI. Set MONGODB_URI, MONGO_URI, or DATABASE_URL');
  }
  await mongoose.connect(uri);
}

async function ensureIndexes(): Promise<void> {
  await connectFromEnv();
  try {
    for (const spec of INDEX_SPECS) {
      const collection = mongoose.connection.collection(spec.collection);
      await collection.createIndex(spec.key, { background: true, ...(spec.options || {}) });
      console.log(
        `index ensured: ${spec.collection} -> ${JSON.stringify(spec.key)}${spec.options?.name ? ` (${spec.options.name})` : ''}`
      );
    }
    console.log(`Index synchronization complete. total=${INDEX_SPECS.length}`);
  } finally {
    await mongoose.connection.close();
  }
}

ensureIndexes().catch((error) => {
  console.error('Index synchronization failed:', error);
  process.exit(1);
});
