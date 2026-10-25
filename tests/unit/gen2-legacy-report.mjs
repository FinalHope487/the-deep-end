// The measurement report of the legacy layout, for the historical regression tests. The report comes from a child process whose World2
// plans no cluster district, so the override never reaches the parent test process or production code.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CORPUS } from '../../js/gen2-measure.js';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const CHILD_SOURCE = `
import { readFileSync } from 'node:fs';
import { World2 } from './js/gen2.js';
import { measureWorld } from './js/gen2-measure.js';

World2.prototype.districtPlan = function () {
  return null;
};

const args = JSON.parse(readFileSync(0, 'utf8'));
const report = measureWorld(args);

process.stdout.write(JSON.stringify(report));
`;

export function legacyReport({ seeds, cells } = CORPUS) {
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', CHILD_SOURCE], {
    cwd: repoRoot,
    input: JSON.stringify({ seeds, cells }),
    encoding: 'utf8',
    maxBuffer: 67108864,
  });
  return JSON.parse(out);
}
