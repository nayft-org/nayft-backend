#!/usr/bin/env ts-node
/**
 * Lint: trackEvent() calls must map to CLIENT_EVENT_DEFINITIONS keys.
 */
import fs from 'fs';
import path from 'path';
import { CLIENT_EVENT_DEFINITIONS, eventRegistryKey } from '../../src/core/event-system/eventRegistry';

const MOBILE_SRC = path.join(__dirname, '../../../crypto-market/src');
const TRACK_RE = /trackEvent\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g;

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== 'node_modules') walk(p, acc);
    else if (ent.isFile() && /\.(ts|tsx)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

const unknown: { file: string; key: string }[] = [];

for (const file of walk(MOBILE_SRC)) {
  const content = fs.readFileSync(file, 'utf8');
  let m: RegExpExecArray | null;
  while ((m = TRACK_RE.exec(content)) !== null) {
    const key = eventRegistryKey(m[1], m[2]);
    if (!(key in CLIENT_EVENT_DEFINITIONS)) {
      unknown.push({ file: path.relative(process.cwd(), file), key });
    }
  }
}

if (unknown.length > 0) {
  console.error('Unknown trackEvent registry keys:', unknown);
  process.exit(1);
}

console.log('Event registry lint passed', Object.keys(CLIENT_EVENT_DEFINITIONS).length, 'definitions');
