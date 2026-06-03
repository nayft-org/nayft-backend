import { RiskScoreHistory } from '../models/RiskScoreHistory';

export type RiskHistoryDoc = {
  symbol: string;
  buildId: string;
  revision: number;
  computedAt: Date;
  crs: number;
  rank: number;
  regime: string;
};

const BATCH_SIZE = 500;

/**
 * Persists score history without blocking the build coordinator return path.
 */
export function queueRiskScoreHistory(docs: RiskHistoryDoc[]): void {
  if (docs.length === 0) return;
  setImmediate(() => {
    void (async () => {
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const slice = docs.slice(i, i + BATCH_SIZE);
        try {
          await RiskScoreHistory.insertMany(slice, { ordered: false });
        } catch (err) {
          console.error('[RiskHistoryWriter] batch failed', err);
        }
      }
    })();
  });
}
