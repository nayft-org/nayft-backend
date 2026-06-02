import { randomUUID } from 'crypto';
import { loadFrozenUniverse } from '../universe/rrsUniverse.service';
import { runRiskBuild } from '../build/riskBuildCoordinator';
import { getRiskSnapshot } from '../publish/riskSnapshotPublisher';
import { RiskRecalcJob } from '../models/RiskRecalcJob';

export type ReplayResult = {
  ok: boolean;
  replayId: string;
  buildId: string;
  error?: string;
  diffSummary?: { coinCount: number };
};

/**
 * Replay a historical build in an isolated namespace — never touches production revision.
 */
export async function runRiskReplay(sourceBuildId: string): Promise<ReplayResult> {
  const replayId = randomUUID();
  const universe = await loadFrozenUniverse(sourceBuildId);
  if (!universe) {
    return { ok: false, replayId, buildId: sourceBuildId, error: 'universe_not_found' };
  }

  await RiskRecalcJob.create({
    buildId: replayId,
    status: 'running',
    reason: `replay:${sourceBuildId}`,
    startedAt: new Date(),
  });

  const result = await runRiskBuild({
    buildId: sourceBuildId,
    namespace: 'replay',
    replayId,
  });

  const replaySnap = await getRiskSnapshot('replay', replayId);

  await RiskRecalcJob.updateOne(
    { buildId: replayId },
    {
      $set: {
        status: result.ok ? 'completed' : 'failed',
        completedAt: new Date(),
        error: result.error,
      },
    }
  );

  return {
    ok: result.ok,
    replayId,
    buildId: sourceBuildId,
    error: result.error,
    diffSummary: replaySnap ? { coinCount: replaySnap.coins.length } : undefined,
  };
}
