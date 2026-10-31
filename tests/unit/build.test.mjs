import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  cpSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Layer: fast unit.
// N24: fresh source-to-release build.
// N25: unsafe build destination must fail safely.

const REPO = join(import.meta.dirname, '..', '..');

function withSource(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'deepend-build-test-'));

  try {
    cpSync(join(REPO, 'index.html'), join(dir, 'index.html'));
    cpSync(join(REPO, 'js'), join(dir, 'js'), {
      recursive: true,
    });
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runBuild(dir, out) {
  return spawnSync(
    process.execPath,
    [
      join(REPO, 'tools', 'build.mjs'),
      '--root', dir,
      '--out', out,
    ],
    { encoding: 'utf8' }
  );
}

test('N24: current sources produce the required release modules', () => {
  withSource(dir => {
    const out = join(dir, 'out');
    const result = runBuild(dir, out);

    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);

    const html = readFileSync(join(out, 'index.html'), 'utf8');

    assert.ok(
      !/src="js\//.test(html),
      'release HTML still depends on source scripts'
    );

    assert.match(
      readFileSync(
        join(out, 'js', 'gen2-s2-worker.js'),
        'utf8'
      ),
      /planS2TileJob/
    );

    assert.match(
      readFileSync(
        join(out, 'js', 'gen2-s2-runtime.js'),
        'utf8'
      ),
      /verifyS2SetJob/
    );
  });
});

test('N25: an overlapping build destination fails without overwriting sources', () => {
  withSource(dir => {
    const source = join(dir, 'index.html');
    const original = readFileSync(source, 'utf8');

    const result = runBuild(dir, dir);

    assert.equal(result.error, undefined);
    assert.notEqual(
      result.status,
      0,
      'build accepted its source root as output'
    );

    assert.equal(
      readFileSync(source, 'utf8'),
      original,
      'failed build changed source HTML'
    );
  });
});
