import cron from 'node-cron';
import { riskConfig } from '../config/riskConfig';
import { runRiskBuild } from '../build/riskBuildCoordinator';

export function startRiskBuildScheduler(): void {
  if (!riskConfig.buildEnabled && !riskConfig.shadowMode) return;

  cron.schedule(riskConfig.buildCron, () => {
    runRiskBuild().catch((err) => console.error('[RiskBuild]', err));
  });
  console.log(`[RiskBuild] scheduled: ${riskConfig.buildCron} (shadow=${riskConfig.shadowMode})`);
}
