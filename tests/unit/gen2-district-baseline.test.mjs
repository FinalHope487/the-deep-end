// T2 regression oracle: with the legacy layout pinned (clusterShare 0) the v2 generator must keep producing the plans and the report captured before the district layer
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { World2 } from '../../js/gen2.js';
import { CORPUS } from '../../js/gen2-measure.js';
import { legacyReport } from './gen2-legacy-report.mjs';

const baseline = JSON.parse(readFileSync(new URL('../fixtures/gen2-district-baseline.json', import.meta.url), 'utf8'));
const sha = (text) => createHash('sha256').update(text).digest('hex');

test('district baseline: 512 default plans unchanged', () => {
  assert.equal(baseline.version, 1);
  const keys = Object.keys(baseline.planSha256);
  assert.equal(keys.length, 512);
  const seen = new Set();
  for (const seed of CORPUS.seeds) {
    const w = new World2(seed, { clusterShare: 0 });
    for (const [i, j] of CORPUS.cells) {
      const key = `${seed}:${i},${j}`;
      seen.add(key);
      assert.match(baseline.planSha256[key], /^[0-9a-f]{64}$/, key);
      assert.equal(sha(JSON.stringify(w.plan(i, j))), baseline.planSha256[key], key);
    }
  }
  assert.deepEqual([...seen].sort(), keys.sort());
});

test('district baseline: deterministic report unchanged', () => {
  const { cost, ...report } = legacyReport(CORPUS);
  assert.ok(cost !== undefined, 'the legacy report keeps a cost to strip');
  const text = JSON.stringify(report);
  assert.equal(sha(JSON.stringify(baseline.report)), baseline.reportSha256);
  assert.equal(sha(text), baseline.reportSha256);
  assert.deepEqual(JSON.parse(text), baseline.report);
});
