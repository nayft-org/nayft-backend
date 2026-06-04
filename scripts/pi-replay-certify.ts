/**
 * Golden fixture certification for PI engines.
 * Usage:
 *   npx ts-node --transpile-only scripts/pi-replay-certify.ts
 *   npx ts-node --transpile-only scripts/pi-replay-certify.ts --write-expected
 */
import {
  GOLDEN_FIXTURE_IDS,
  certifyAll,
  runGoldenFixture,
  writeExpected,
} from '../src/modules/portfolio-intelligence/engines/__fixtures__/goldenHarness';

const writeExpectedFlag = process.argv.includes('--write-expected');

if (writeExpectedFlag) {
  for (const id of GOLDEN_FIXTURE_IDS) {
    writeExpected(id, runGoldenFixture(id));
    console.log(`wrote expected/${id}.json`);
  }
  process.exit(0);
}

const { passed, failed } = certifyAll();
console.log(`PI golden certify: ${passed.length}/${GOLDEN_FIXTURE_IDS.length} passed`);
if (failed.length) {
  for (const f of failed) {
    console.error(`FAIL ${f.id}: ${f.diffs.join(', ')}`);
  }
  process.exit(1);
}

process.exit(0);
