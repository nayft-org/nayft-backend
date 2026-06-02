import { connectDatabase } from '../src/config/database';
import { runRiskBuild } from '../src/modules/risk/build/riskBuildCoordinator';

async function main(): Promise<void> {
  await connectDatabase();
  const result = await runRiskBuild();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
