export type ActiveSearchSegment =
  | 'coins'
  | 'news'
  | 'users'
  | 'newsBoards'
  | 'portfolioAssets';

export type SegmentRunStatus = 'ok' | 'empty' | 'timeout' | 'error';

export interface SegmentRunResult<T> {
  segment: ActiveSearchSegment;
  status: SegmentRunStatus;
  data: T;
  tookMs: number;
}

/**
 * Runs `promise` and resolves within `ms` with a stable outcome (never rejects).
 * Timeouts resolve with status `timeout` and empty data — avoids unhandled rejections with `Promise.allSettled`.
 */
export async function withSegmentTimeout<T extends unknown[]>(
  segment: ActiveSearchSegment,
  promise: Promise<T>,
  ms: number
): Promise<SegmentRunResult<T>> {
  const started = Date.now();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        segment,
        status: 'timeout',
        data: [] as unknown as T,
        tookMs: Date.now() - started,
      });
    }, ms);

    promise
      .then((data) => {
        clearTimeout(timer);
        const arr = data as unknown[];
        const empty = Array.isArray(arr) && arr.length === 0;
        resolve({
          segment,
          status: empty ? 'empty' : 'ok',
          data,
          tookMs: Date.now() - started,
        });
      })
      .catch(() => {
        clearTimeout(timer);
        resolve({
          segment,
          status: 'error',
          data: [] as unknown as T,
          tookMs: Date.now() - started,
        });
      });
  });
}
