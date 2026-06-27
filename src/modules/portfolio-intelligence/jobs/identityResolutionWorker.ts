import { connectDatabase } from '../../../config/database';
import { Coin } from '../../coin/model';
import { IdentityResolutionQueue } from '../../coin/models/IdentityResolutionQueue';
import { identityResolver } from '../../coin/identityResolver';

const BATCH_SIZE = parseInt(process.env.PI_IDENTITY_RESOLUTION_BATCH || '100', 10);

export async function runIdentityResolutionWorker(limit = BATCH_SIZE): Promise<number> {
  await connectDatabase();

  const pending = await IdentityResolutionQueue.find({
    status: { $in: ['pending', 'retrying'] },
    retryCount: { $lt: 5 },
  })
    .sort({ retryCount: 1, firstSeenAt: 1 })
    .limit(limit)
    .lean();

  let resolved = 0;

  for (const item of pending) {
    const token = item.normalizedToken || item.inputToken;
    try {
      const byRegistry = await Coin.findOne({
        $or: [
          { symbolLower: token.toLowerCase() },
          { coinId: token },
          { internalCoinId: token },
        ],
      })
        .select('internalCoinId symbol')
        .lean();

      if (byRegistry?.internalCoinId) {
        await IdentityResolutionQueue.updateOne(
          { _id: item._id },
          {
            $set: {
              status: 'resolved',
              resolutionSource: 'symbol',
              confidence: 0.9,
              lastTriedAt: new Date(),
              'evidence.resolvedInternalCoinId': byRegistry.internalCoinId,
              'evidence.resolvedSymbol': byRegistry.symbol,
            },
          }
        );
        resolved += 1;
        continue;
      }

      const resolution = await identityResolver.resolve(item.inputToken);
      if (resolution.internalCoinId) {
        await IdentityResolutionQueue.updateOne(
          { _id: item._id },
          {
            $set: {
              status: 'resolved',
              resolutionSource: resolution.resolutionSource,
              confidence: resolution.confidence,
              lastTriedAt: new Date(),
              'evidence.resolvedInternalCoinId': resolution.internalCoinId,
            },
          }
        );
        resolved += 1;
      } else {
        await IdentityResolutionQueue.updateOne(
          { _id: item._id },
          {
            $set: { status: 'retrying', lastTriedAt: new Date() },
            $inc: { retryCount: 1 },
          }
        );
      }
    } catch (err) {
      await IdentityResolutionQueue.updateOne(
        { _id: item._id },
        {
          $set: {
            status: 'retrying',
            lastTriedAt: new Date(),
            resolutionError: err instanceof Error ? err.message : String(err),
          },
          $inc: { retryCount: 1 },
        }
      );
    }
  }

  console.log('[PI IdentityResolution]', { processed: pending.length, resolved });
  return resolved;
}

if (require.main === module) {
  runIdentityResolutionWorker()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
