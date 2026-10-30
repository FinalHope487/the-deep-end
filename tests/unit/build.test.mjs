// Inner layer: the single-file merge refuses sources that would break once concatenated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, appendFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = join(import.meta.dirname, '..', '..');

function buildCopy(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'deepend-build-test-'));
  cpSync(join(REPO, 'index.html'), join(dir, 'index.html'));
  cpSync(join(REPO, 'js'), join(dir, 'js'), { recursive: true });
  mutate?.(dir);
  const r = spawnSync(process.execPath, [join(REPO, 'tools', 'build.mjs'), '--root', dir, '--out', join(dir, 'out')], { encoding: 'utf8' });
  return { dir, ...r };
}

test('current sources merge into one file with no module imports left', () => {
  const r = buildCopy();
  assert.equal(r.status, 0, r.stderr);
  const html = readFileSync(join(r.dir, 'out', 'index.html'), 'utf8');
  assert.ok(!/src="js\//.test(html));
  assert.equal((html.match(/^import /gm) || []).length, 1);   // only THREE
  assert.match(readFileSync(join(r.dir,'out','js','gen2-s2-worker.js'),'utf8'),/planS2TileJob/);
  assert.match(readFileSync(join(r.dir,'out','js','gen2-s2-runtime.js'),'utf8'),/verifyS2SetJob/);
  rmSync(r.dir, { recursive: true, force: true });
});

test('a duplicate top-level name hidden in a comma declaration fails the build', () => {
  const r = buildCopy((dir) => appendFileSync(join(dir, 'js', 'ui.js'), '\nexport const uiOnlyName = 1, WALL = 2;\n'));
  assert.notEqual(r.status, 0, 'build accepted a second `WALL`');
  rmSync(r.dir, { recursive: true, force: true });
});

test('an output folder that overlaps the sources is refused', () => {
  for (const out of ['.', 'js']) {
    const dir = mkdtempSync(join(tmpdir(), 'deepend-build-test-'));
    cpSync(join(REPO, 'index.html'), join(dir, 'index.html'));
    cpSync(join(REPO, 'js'), join(dir, 'js'), { recursive: true });
    const r = spawnSync(process.execPath, [join(REPO, 'tools', 'build.mjs'), '--root', dir, '--out', join(dir, out)], { encoding: 'utf8' });
    assert.notEqual(r.status, 0, `--out ${out} was accepted`);
    assert.ok(readFileSync(join(dir, 'index.html'), 'utf8').includes('src="js/main.js"'), 'source index.html was overwritten');
    rmSync(dir, { recursive: true, force: true });
  }
});
