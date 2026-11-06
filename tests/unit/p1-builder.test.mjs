// Check IDs: P1-A09 (slice 3a: real builder CLI, templates, safe paths, Worker copy).
// New CLI contract in tools/build.mjs:
//   --entry js/<path>.js: POSIX entry path under --root/js; default js/main.js.
//   --html <path>.html: template relative to --root; default index.html.
//   --root DIR, --out DIR: existing CLI; output index.html lives under --out.
//   Usage error exits 2; invalid source, path or template exits 1.
// Test inputs are written inside OS temporary trees, never into the repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync,
  rmSync, writeFileSync, cpSync, symlinkSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const BUILDER = join(REPO, 'tools', 'build.mjs');
const TIMEOUT = 30000;
function put(root, path, data) {
  const target = join(root, ...path.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
}
async function temporary(action) {
  const root = mkdtempSync(join(tmpdir(), 'p1-builder-'));
  try { return await action(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}
function fixture(root, { legacyWorker = true } = {}) {
  put(root, 'index.html', '<!doctype html><title>Legacy</title>\n<script type="module" src="js/main.js"></script>\n');
  put(root, 'js/main.js', 'export const legacyFixtureReady = true;\n');
  if (legacyWorker) put(root, 'js/gen2-s2-worker.js', 'self.onmessage = () => {};\n');
  put(root, 'js/v3/package.json', '{"type":"module"}\n');
  put(root, 'js/v3/core/value.js', 'export const v3FixtureValue = 41;\n');
  put(root, 'js/v3/entry/main.js', [
    "import { v3FixtureValue } from '../core/value.js';",
    'export const v3FixtureAnswer = v3FixtureValue + 1;',
    "const fixtureWorker = new Worker(new URL('js/v3/workers/echo.js', document.baseURI), { type: 'module' });",
    'fixtureWorker.onmessage = (e) => { window.__fixtureWorkerAnswer = e.data; };',
    'fixtureWorker.postMessage(42);', '',
  ].join('\n'));
  put(root, 'js/v3/workers/echo.js', 'self.onmessage = (e) => self.postMessage(e.data);\n');
  put(root, 'js/v3/diagnostic/index.html', [
    '<!doctype html><title>V3 fixture</title>',
    '<script type="importmap">{"imports":{"three":"./vendor/three.js"}}</script>',
    "<script type=\"module\">import './js/v3/entry/main.js';</script>", '',
  ].join('\n'));
  return root;
}
const entryFlags = ['--entry', 'js/v3/entry/main.js', '--html', 'js/v3/diagnostic/index.html'];
function build(root, out, flags = entryFlags) {
  const result = spawnSync(process.execPath,
    [BUILDER, '--root', root, '--out', out, ...flags],
    { cwd: REPO, encoding: 'utf8', timeout: TIMEOUT, windowsHide: true });
  assert.equal(result.error, undefined, String(result.error));
  return result;
}
function exited(result, status) {
  assert.equal(result.status, status, `expected exit=${status}; stdout=${result.stdout}; stderr=${result.stderr}`);
}
function fileList(root) {
  const all = [];
  function visit(folder) {
    for (const item of readdirSync(folder, { withFileTypes: true })) {
      const file = join(folder, item.name);
      if (item.isDirectory()) visit(file);
      else if (item.isFile()) all.push(relative(root, file).split(sep).join('/'));
    }
  }
  visit(root);
  return all.sort();
}
function digest(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }

test('[P1-A09] --entry and --html build a real nested entry and preserve Worker URL', async () => {
  await temporary(async (temp) => {
    const root = fixture(join(temp, 'source'), { legacyWorker: false });
    const out = join(temp, 'subpath', 'p1');
    exited(build(root, out), 0);
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    assert.match(html, /v3FixtureAnswer = v3FixtureValue \+ 1/);
    assert.match(html, /v3FixtureValue = 41/);
    assert.doesNotMatch(html, /src="js\/main.js"/);
    assert.match(html, /new URL\('js\/v3\/workers\/echo.js', document\.baseURI\)/);
    assert.ok(existsSync(join(out, 'js', 'v3', 'workers', 'echo.js')),
      'v3 mode must copy Worker sources even without the legacy gen2 Worker');
    assert.ok(existsSync(join(out, 'js', 'v3', 'core', 'value.js')));
    assert.equal(html.match(/<script type="importmap">/g)?.length, 1);
  });
});

test('[P1-A09] invalid, repeated, missing and unknown CLI flags exit 2', async () => {
  await temporary(async (temp) => {
    const root = fixture(join(temp, 'source'));
    const out = join(temp, 'out');
    const invalid = [
      ['--entry'], ['--html'], ['--entry', '--html', 'x'],
      ['--entry', 'js/v3/entry/main.js', '--entry', 'js/v3/entry/main.js'],
      ['--html', 'js/v3/diagnostic/index.html', '--html', 'js/v3/diagnostic/index.html'],
      ['--surprise', 'value'],
    ];
    for (const flags of invalid) exited(build(root, out, flags), 2);
  });
});

test('[P1-A09] invalid paths, escaping sources and mismatched templates exit 1', async () => {
  await temporary(async (temp) => {
    const root = fixture(join(temp, 'source'));
    const invalid = [
      ['--entry', 'main.js', '--html', 'js/v3/diagnostic/index.html'],
      ['--entry', '../outside.js', '--html', 'js/v3/diagnostic/index.html'],
      ['--entry', 'js/missing.js', '--html', 'js/v3/diagnostic/index.html'],
      ['--entry', 'js/main.txt', '--html', 'js/v3/diagnostic/index.html'],
      ['--entry', 'js/v3/entry/main.js', '--html', '../outside.html'],
    ];
    for (const [i, flags] of invalid.entries()) {
      exited(build(root, join(temp, `out-${i}`), flags), 1);
    }
    put(root, 'js/v3/diagnostic/index.html', '<title>Wrong tag</title>\n');
    exited(build(root, join(temp, 'no-tag')), 1);
    put(root, 'js/v3/diagnostic/index.html', [
      '<title>Duplicate tag</title>',
      "<script type=\"module\">import './js/v3/entry/main.js';</script>",
      "<script type=\"module\">import './js/v3/entry/main.js';</script>", '',
    ].join('\n'));
    exited(build(root, join(temp, 'two-tags')), 1);
  });
});

test('[P1-A09] output may be inside root/dist but cannot overwrite input or source', async () => {
  await temporary(async (temp) => {
    const root = fixture(join(temp, 'source'));
    exited(build(root, join(root, 'dist')), 0);
    for (const target of [root, join(root, 'js', 'out'),
      join(root, 'audio'), join(root, 'js', 'v3', 'diagnostic')]) {
      exited(build(root, target), 1);
    }
    assert.match(readFileSync(join(root, 'js/v3/diagnostic/index.html'), 'utf8'),
      /import '\.\/js\/v3\/entry\/main\.js'/);
  });
});

test('[P1-A09] symlink or junction path escaping the real root is rejected', async () => {
  await temporary(async (temp) => {
    const root = fixture(join(temp, 'source'));
    const external = join(temp, 'elsewhere');
    mkdirSync(external);
    put(external, 'external.js', 'export const escapedFixture = 1;\n');
    symlinkSync(external, join(root, 'js', 'outside-link'), 'junction');
    exited(build(root, join(temp, 'escape-out'), [
      '--entry', 'js/outside-link/external.js', '--html', 'js/v3/diagnostic/index.html',
    ]), 1);
    put(external, 'template.html', '<title>Outside</title>\n');
    exited(build(root, join(temp, 'html-escape'), [
      '--entry', 'js/v3/entry/main.js', '--html', 'js/outside-link/template.html',
    ]), 1);
  });
});

// Materialize the P0 freeze commit, not the older pre-P0 content baseline.
// Full file lists and hashes are compared; no working-tree paths are modified.
test('[P1-A09] default output tree is byte-identical to the P0 freeze', async () => {
  await temporary(async (temp) => {
    const manifest = JSON.parse(readFileSync(join(REPO, 'versions/p0/manifest.json'), 'utf8'));
    assert.match(manifest.commit, /^[0-9a-f]{40}$/);
    const baseline = join(temp, 'baseline'), currentSource = join(temp, 'current-source');
    const materialize = (rev, dest) => {
      const names = spawnSync('git', ['-c', 'core.autocrlf=false', 'ls-tree', '-r', '--name-only', rev],
        { cwd: REPO, encoding: 'utf8', timeout: TIMEOUT, windowsHide: true });
      exited(names, 0);
      const paths = names.stdout.trim().split(/\r?\n/).filter((p) =>
        p === 'index.html' || p.startsWith('js/') || p.startsWith('audio/') || p === 'tools/build.mjs');
      for (const path of paths) {
        const blob = spawnSync('git', ['-c', 'core.autocrlf=false', 'show', `${rev}:${path}`],
          { cwd: REPO, encoding: null, timeout: TIMEOUT, maxBuffer: 128 * 1024 * 1024, windowsHide: true });
        assert.equal(blob.status, 0, `cannot materialize ${rev} file ${path}`);
        put(dest, path, blob.stdout);
      }
    };
    materialize(manifest.commit, baseline);
    materialize('HEAD', currentSource);
    // build() invokes the working-tree BUILDER; it never runs the archived builder.
    put(currentSource, 'tools/build.mjs', readFileSync(BUILDER));
    const oldOut = join(temp, 'old-out'), currentOut = join(temp, 'current-out');
    exited(build(baseline, oldOut, []), 0);
    exited(build(currentSource, currentOut, []), 0);
    const a = fileList(oldOut), b = fileList(currentOut);
    assert.deepEqual(b, a, 'default output file list changed');
    for (const path of a) assert.equal(digest(join(currentOut, path)), digest(join(oldOut, path)),
      `default output bytes differ: ${path}`);
  });
});
