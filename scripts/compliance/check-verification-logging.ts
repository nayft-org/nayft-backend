/**
 * CI guard: verification codes must not be logged without dev-only guards.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../../src/modules/auth/verification');
const FORBIDDEN = /console\.(log|info|debug|warn)\([^)]*[Cc]ode:/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

let failed = false;
for (const file of walk(ROOT)) {
  if (file.endsWith('verificationDebugLog.ts')) continue;
  const content = fs.readFileSync(file, 'utf8');
  if (FORBIDDEN.test(content)) {
    console.error(`[check-verification-logging] Forbidden code logging in ${file}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log('[check-verification-logging] OK');
