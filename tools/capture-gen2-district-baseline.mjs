// One-time capture of the legacy v2 oracle used by tests/unit/gen2-district-baseline.test.mjs: a SHA-256 per plan over the
// fixed corpus, plus the deterministic measurement report. Refuses to overwrite an existing fixture.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { World2 } from '../js/gen2.js';
import { CORPUS, measureWorld } from '../js/gen2-measure.js';

const sha = (text) => createHash('sha256').update(text).digest('hex');
const dir = new URL('../tests/fixtures/', import.meta.url);
const file = new URL('gen2-district-baseline.json', dir);

const planSha256 = {};
for (const seed of CORPUS.seeds) {
  const w = new World2(seed);
  for (const [i, j] of CORPUS.cells) planSha256[`${seed}:${i},${j}`] = sha(JSON.stringify(w.plan(i, j)));
}
const { cost, ...report } = measureWorld(CORPUS);
const out = { version: 1, planSha256, report, reportSha256: sha(JSON.stringify(report)) };

mkdirSync(dir, { recursive: true });
try {
  writeFileSync(file, JSON.stringify(out, null, 1) + '\n', { flag: 'wx' });
} catch (e) {
  if (e.code === 'EEXIST') { console.error('baseline exists, refusing to overwrite:', file.pathname); process.exit(1); }
  throw e;
}
console.log(`captured ${Object.keys(planSha256).length} plan hashes and the report to ${file.pathname}`);
