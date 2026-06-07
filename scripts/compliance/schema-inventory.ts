#!/usr/bin/env ts-node
/**
 * Static scan for Schema.Types.Mixed in mongoose models.
 * Usage: npm run script:schema-inventory
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '../../src');

function walk(dir: string, acc: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== 'node_modules') walk(p, acc);
    else if (ent.isFile() && /\.(ts|js)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

const files = walk(SRC);
const mixedHits: { file: string; line: number; text: string }[] = [];
const recordHits: { file: string; line: number; text: string }[] = [];

for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/Schema\.Types\.Mixed/.test(line)) {
      mixedHits.push({ file: path.relative(process.cwd(), file), line: i + 1, text: line.trim() });
    }
    if (/z\.record\s*\(/.test(line)) {
      recordHits.push({ file: path.relative(process.cwd(), file), line: i + 1, text: line.trim() });
    }
  });
}

console.log(JSON.stringify({ mixedHits, recordHits, mixedCount: mixedHits.length, recordCount: recordHits.length }, null, 2));
