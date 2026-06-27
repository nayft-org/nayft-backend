import { PortfolioAnalyticsSnapshot } from '../models/PortfolioAnalyticsSnapshot';

const ARCHIVE_AFTER_DAYS = 90;

export const piSnapshotArchiveService = {
  async archiveStaleSnapshots(batchLimit = 200): Promise<number> {
    const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000);
    const stale = await PortfolioAnalyticsSnapshot.find({
      computedAt: { $lt: cutoff },
      archivedAt: { $exists: false },
    })
      .select('_id')
      .limit(batchLimit)
      .lean();

    if (stale.length === 0) return 0;

    await PortfolioAnalyticsSnapshot.updateMany(
      { _id: { $in: stale.map((s) => s._id) } },
      { $set: { archivedAt: new Date() } }
    );
    return stale.length;
  },
};
