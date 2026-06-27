import { connectDatabase } from '../../../config/database';
import { Holding } from '../../portfolio/models/Holding';
import { piRepository } from '../repository/piRepository';
import { snapshotWriterService } from '../services/snapshotWriter.service';
import { redis } from '../../../config/redis';
import { piRedisKeys } from '../cache/piRedisKeys';
import { recomputeEnqueueService } from '../services/recomputeEnqueue.service';
import { piConfig } from '../config/piConfig';
import { piSnapshotArchiveService } from '../services/piSnapshotArchive.service';

export async function runPiSnapshotDaily(batchLimit = 500): Promise<void> {
  await connectDatabase();
  const rows = await Holding.find({ totalValue: { $gt: 0 } })
    .select('userId ingestRevision')
    .limit(batchLimit)
    .lean();

  let enqueued = 0;
  for (const row of rows) {
    if (enqueued >= piConfig.dailySnapshotBatchPerMin) break;
    const userId = row.userId as string;
    const positions = await piRepository.findPositionsByUser(userId);
    const total = positions.reduce((s, p) => s + p.valueUsd, 0);
    const ingestRevision = parseInt(
      (await redis.get(piRedisKeys.ingestRevision(userId))) || String(row.ingestRevision ?? 0),
      10
    );
    const revision = parseInt((await redis.get(piRedisKeys.userRevision(userId))) || '0', 10);
    await snapshotWriterService.writeDaily(userId, ingestRevision, revision || 1, positions, total);
    await recomputeEnqueueService.enqueue(userId, 'daily');
    enqueued += 1;
  }
  const archived = await piSnapshotArchiveService.archiveStaleSnapshots(200);
  console.log('[PI DailySnapshot] processed', enqueued, 'archived', archived);
}

if (require.main === module) {
  runPiSnapshotDaily()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
