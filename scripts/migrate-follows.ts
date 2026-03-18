import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/database';
import { User } from '../src/modules/user/model';
import { Wishlist } from '../src/modules/wishlist/model';
import { Follow } from '../src/modules/follow/model';

async function migrateFollows(): Promise<void> {
  await connectDatabase();

  try {
    const bulkOps: any[] = [];

    const wishlistEntries = await Wishlist.find({}).select('userId coinId').lean();
    for (const row of wishlistEntries) {
      if (!row.userId || !row.coinId) continue;
      bulkOps.push({
        updateOne: {
          filter: { followerId: row.userId, targetType: 'coin', targetId: row.coinId },
          update: {
            $setOnInsert: {
              followerId: row.userId,
              targetType: 'coin',
              targetId: row.coinId,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          upsert: true,
        },
      });
    }

    const users = await User.find({}).select('_id followingCoins').lean();
    for (const user of users) {
      const followerId = user._id.toString();
      const followingCoins = Array.isArray((user as any).followingCoins)
        ? ((user as any).followingCoins as string[])
        : [];

      for (const coinId of followingCoins) {
        if (!coinId) continue;
        bulkOps.push({
          updateOne: {
            filter: { followerId, targetType: 'coin', targetId: coinId },
            update: {
              $setOnInsert: {
                followerId,
                targetType: 'coin',
                targetId: coinId,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            },
            upsert: true,
          },
        });
      }
    }

    if (bulkOps.length > 0) {
      const result = await Follow.bulkWrite(bulkOps, { ordered: false });
      console.log(
        `Follow migration complete. inserted=${result.upsertedCount}, matched=${result.matchedCount}, modified=${result.modifiedCount}`
      );
    } else {
      console.log('Follow migration complete. No records to migrate.');
    }
  } finally {
    await mongoose.connection.close();
  }
}

migrateFollows().catch((error) => {
  console.error('Follow migration failed:', error);
  process.exit(1);
});
