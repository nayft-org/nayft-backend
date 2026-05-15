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
    collection: 'market_ohlcv_candles',
    key: { 'meta.exchange': 1, 'meta.symbol': 1, 'meta.interval': 1, openTime: -1 },
    options: { name: 'kline_market_lookup' },
  },
  {
    collection: 'market_ohlcv_candles',
    key: { 'meta.exchange': 1, 'meta.symbol': 1, 'meta.interval': 1, openTime: 1 },
    options: { unique: true, name: 'kline_market_open_unique' },
  },
  {
    collection: 'exchange_trade_ticks',
    key: { 'meta.exchange': 1, 'meta.symbol': 1, 'meta.dataType': 1, time: -1 },
    options: { name: 'trade_market_lookup' },
  },
  { collection: 'notifications', key: { userId: 1, userSeq: 1 }, options: { unique: true, name: 'notif_user_seq' } },
  { collection: 'notifications', key: { userId: 1, status: 1, createdAt: -1 }, options: { name: 'notif_user_status_created' } },
  { collection: 'notificationpreferences', key: { userId: 1 }, options: { unique: true, name: 'notif_pref_user' } },

async function connectFromEnv(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) {
    throw new Error('Missing Mongo URI. Set MONGODB_URI, MONGO_URI, or DATABASE_URL');
  }
  await mongoose.connect(uri);
}

async function ensureIndexes(): Promise<void> {
  await connectFromEnv();
  let succeeded = 0;
  const failures: Array<{ collection: string; name?: string; key: Record<string, 1 | -1>; error: string }> = [];
  try {
    for (const spec of INDEX_SPECS) {
      const label = `${spec.collection} -> ${JSON.stringify(spec.key)}${spec.options?.name ? ` (${spec.options.name})` : ''}`;
      try {
        const collection = mongoose.connection.collection(spec.collection);
        await collection.createIndex(spec.key, { background: true, ...(spec.options || {}) });
        succeeded += 1;
        console.log(`index ensured: ${label}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push({
          collection: spec.collection,
          name: spec.options?.name as string | undefined,
          key: spec.key,
          error: message,
        });
        console.error(`index FAILED: ${label} :: ${message}`);
      }
    }
    console.log(
      `Index synchronization complete. total=${INDEX_SPECS.length} succeeded=${succeeded} failed=${failures.length}`
    );
    if (failures.length > 0) {
      console.error('Failed indexes summary:');
      for (const f of failures) {
        console.error(`  - ${f.collection} ${f.name ?? ''} ${JSON.stringify(f.key)} :: ${f.error}`);
      }
    }
  } finally {
    await mongoose.connection.close();
  }
}

ensureIndexes().catch((error) => {
  console.error('Index synchronization failed:', error);
  process.exit(1);
});
