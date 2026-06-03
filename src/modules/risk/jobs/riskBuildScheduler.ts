import cron from 'node-cron';
import { riskConfig } from '../config/riskConfig';
import { runRiskBuild } from '../build/riskBuildCoordinator';
import { compactRiskFactorRaws } from './riskFactorCompaction';

export function startRiskBuildScheduler(): void {
  if (!riskConfig.buildEnabled && !riskConfig.shadowMode) return;

  cron.schedule(riskConfig.buildCron, () => {
    runRiskBuild().catch((err) => console.error('[RiskBuild]', err));
  });

  cron.schedule('0 3 * * *', () => {
    compactRiskFactorRaws().catch((err) => console.error('[RiskCompaction]', err));
  });

  console.log(`[RiskBuild] scheduled: ${riskConfig.buildCron} (shadow=${riskConfig.shadowMode})`);
}
