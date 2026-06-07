#!/usr/bin/env ts-node
/** ERG gate check — reads rollout-status.json; exit 1 if enforce prerequisites unmet. */
import * as fs from 'fs';
import * as path from 'path';

const statusPath = path.resolve(__dirname, '../../../docs/compliance/rollout-status.json');

interface RolloutStatus {
  runtime_config_deployed?: boolean;
  staging_soak_days?: number;
  kill_switch_drill_passed?: boolean;
  enforcement_readiness_gate?: string;
  ws_v2_mobile_released?: boolean;
  ws_v1_pct_below?: number;
}

function main(): void {
  const enforceMode = process.argv.includes('--enforce');
  if (!fs.existsSync(statusPath)) {
    console.error('Missing rollout-status.json');
    process.exit(enforceMode ? 1 : 0);
  }

  const status = JSON.parse(fs.readFileSync(statusPath, 'utf8')) as RolloutStatus;
  const failures: string[] = [];

  if (enforceMode) {
    if (!status.runtime_config_deployed) failures.push('runtime_config_deployed');
    if ((status.staging_soak_days ?? 0) < 7) failures.push('staging_soak_days >= 7');
    if (!status.kill_switch_drill_passed) failures.push('kill_switch_drill_passed');
    if (status.enforcement_readiness_gate !== 'passed') failures.push('enforcement_readiness_gate');
  }

  if (failures.length > 0) {
    console.error('ERG check failed:', failures.join(', '));
    process.exit(1);
  }

  console.log('ERG check passed');
}

main();
