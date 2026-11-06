// Check IDs: P0-B01, P0-B02, P0-B07, P0-B09
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const BUILDER = join(REPO, 'tools', 'build.mjs');
const FIXTURE = join(REPO, 'tests', 'fixtures', 'nested-entry');
const BASE = 'c511558376fd2081df8b9d4960720df5e02af963';
const LIMIT_MS = 20_000;

function command(program, args, cwd = REPO) {
  const result = spawnSync(program, args, {
    cwd, encoding: 'utf8', timeout: LIMIT_MS, maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  assert.equal(result.error, undefined,
    `[P0-B01] ${program} ${args.join(' ')} failed: ${result.error}`);
  return result;
}

function git(args) {
  return command('git', args);
}

function build(source, output, builder = BUILDER) {
  return command(process.execPath, [builder, '--root', source, '--out', output]);
}

function expectSuccess(id, result) {
  assert.equal(result.status, 0,
    `[${id}] exit=${result.status}; expected 0; stderr=${result.stderr}; stdout=${result.stdout}`);
}

async function withTemp(callback) {
  const dir = mkdtempSync(join(tmpdir(), 'deepend-p0-build-'));
  try {
    return await callback(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function copyFixture(dir) {
  const source = join(dir, 'source');
  cpSync(FIXTURE, source, { recursive: true });
  return source;
}

function baselineTree(dest) {
  const listing = git(['ls-tree', '-r', '--name-only', BASE, '--', 'index.html', 'js/', 'tools/build.mjs']);
  expectSuccess('P0-B01', listing);
  const files = listing.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert.ok(files.includes('index.html') && files.includes('tools/build.mjs'),
    `[P0-B01] baseline file list=${JSON.stringify(files)}`);
  for (const name of files) {
    const blob = spawnSync('git', ['show', `${BASE}:${name}`], {
      cwd: REPO, encoding: null, timeout: LIMIT_MS, maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    assert.equal(blob.error, undefined, `[P0-B01] git show ${name}: ${blob.error}`);
    assert.equal(blob.status, 0,
      `[P0-B01] git show ${name} exit=${blob.status}: ${String(blob.stderr)}`);
    const path = join(dest, ...name.split('/'));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, blob.stdout);
  }
}

function replaceModuleBody(html, name) {
  const marker = `// ---- ${name} ----`;
  const start = html.indexOf(marker);
  assert.ok(start >= 0, `[P0-B01] missing merged module marker=${marker}`);
  const next = html.indexOf('// ---- ', start + marker.length);
  const close = html.indexOf('</script>', start + marker.length);
  assert.ok(close >= 0, `[P0-B01] missing closing script after ${marker}`);
  const end = next >= 0 && next < close ? next : close;
  return html.slice(0, start) + `${marker}\n/* namespace-wiring-only */\n` + html.slice(end);
}

function normalizedBuild(html) {
  html = html.replace(/\r\n/g, '\n');
  const firstScript = html.indexOf('<script>');
  assert.ok(firstScript >= 0, '[P0-B01] missing inline head router script');
  const close = html.indexOf('</script>', firstScript);
  assert.ok(close >= 0, '[P0-B01] unterminated inline head router script');
  let result = html.slice(0, firstScript) + '<script>/* router-only */</script>'
    + html.slice(close + '</script>'.length);
  result = result.replace(/<title>[\s\S]*?<\/title>/, '<title>/* version-only */</title>');
  result = replaceModuleBody(result, 'save.js');
  result = replaceModuleBody(result, 'main.js');
  return result;
}

function assertPermittedSourceEdits(changed, untracked) {
  const outsideV3 = (name) => !name.startsWith('js/v3/');
  assert.deepEqual(changed.filter((name) =>
    outsideV3(name) && !['js/main.js', 'js/save.js'].includes(name)), [],
    `[P0-B01] unauthorized source changes=${JSON.stringify(changed)}`);
  assert.deepEqual(untracked.filter(outsideV3), [],
    `[P0-B01] unexpected untracked js files=${JSON.stringify(untracked)}`);
}

function comparePermittedSourceEdits() {
  const names = git(['diff', '--name-only', BASE, '--', 'js/']);
  expectSuccess('P0-B01', names);
  const changed = names.stdout.trim().split(/\r?\n/).filter(Boolean);

  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', 'js/']);
  expectSuccess('P0-B01', untracked);
  const added = untracked.stdout.trim().split(/\r?\n/).filter(Boolean);
  assertPermittedSourceEdits(changed, added);

  const diff = git(['diff', '--no-ext-diff', '--unified=0', BASE, '--', 'js/main.js']);
  expectSuccess('P0-B01', diff);
  const edits = diff.stdout.split(/\r?\n/).filter((line) =>
    (/^[+-]/.test(line) && !/^\+\+\+|^---/.test(line)));
  for (const line of edits) {
    const permitted = /\bNS\b|__deependVersion|\b(?:loadGame|saveGame|clearGame)\s*\(|^[-+]\s*\}\);\s*$/.test(line);
    assert.ok(permitted,
      `[P0-B01] unexpected js/main.js changed line=${JSON.stringify(line)}`);
  }

  const baselineSave = git(['show', `${BASE}:js/save.js`]);
  expectSuccess('P0-B01', baselineSave);
  const currentSave = readFileSync(join(REPO, 'js', 'save.js'), 'utf8').replace(/\r\n/g, '\n');
  const baselineSaveText = baselineSave.stdout.replace(/\r\n/g, '\n');
  const parseBody = (src) => src.match(/export function parseSave\(s\) \{[\s\S]*?^\}/m)?.[0];
  const settingsBody = (src) => src.slice(src.indexOf('export function loadSettings()'));
  assert.ok(parseBody(currentSave), '[P0-B01] missing parseSave definition');
  assert.equal(parseBody(currentSave), parseBody(baselineSaveText),
    '[P0-B01] parseSave changed; only progress-key plumbing is allowed');
  assert.equal(settingsBody(currentSave), settingsBody(baselineSaveText),
    '[P0-B01] settings functions changed; only progress-key plumbing is allowed');
  assert.match(currentSave, /const SAVE_KEY = 'deepend\.save\.v1';/,
    '[P0-B01] default progress key changed');
  assert.match(currentSave, /const SETTINGS_KEY = 'deepend\.settings\.v1';/,
    '[P0-B01] shared settings key changed');
}

test('[P0-B01] planted non-v3 changes are still rejected', () => {
  assert.doesNotThrow(() => assertPermittedSourceEdits(
    ['js/main.js', 'js/save.js', 'js/v3/core/world.js'],
    ['js/v3/entry/new.js'],
  ));
  assert.throws(() => assertPermittedSourceEdits(
    ['js/v3/core/world.js', 'js/world.js'], [],
  ), /unauthorized source changes/);
  assert.throws(() => assertPermittedSourceEdits(
    [], ['js/mesh.js'],
  ), /unexpected untracked js files/);
});

test('[P0-B01] the default build changes only the permitted router, label and namespace wiring', async () => {
  await withTemp(async (dir) => {
    const oldRoot = join(dir, 'baseline');
    baselineTree(oldRoot);
    const oldOut = join(dir, 'baseline-out');
    const currentOut = join(dir, 'current-out');
    expectSuccess('P0-B01', build(oldRoot, oldOut, join(oldRoot, 'tools', 'build.mjs')));
    expectSuccess('P0-B01', build(REPO, currentOut));
    const before = normalizedBuild(readFileSync(join(oldOut, 'index.html'), 'utf8'));
    const after = normalizedBuild(readFileSync(join(currentOut, 'index.html'), 'utf8'));
    assert.equal(after, before,
      `[P0-B01] default build changed outside router/label/save/main module spans; oldBytes=${before.length}, newBytes=${after.length}`);
    comparePermittedSourceEdits();
  });
});

test('[P0-B02] isolated output leaves the working-tree dist and source bytes intact', async () => {
  await withTemp(async (dir) => {
    const sourcePath = join(REPO, 'index.html');
    const savePath = join(REPO, 'js', 'save.js');
    const distPath = join(REPO, 'dist', 'index.html');
    const sourceBefore = readFileSync(sourcePath);
    const saveBefore = readFileSync(savePath);
    const distBefore = existsSync(distPath) ? readFileSync(distPath) : null;
    const output = join(dir, 'isolated-output');
    expectSuccess('P0-B02', build(REPO, output));
    assert.ok(existsSync(join(output, 'index.html')),
      `[P0-B02] no index.html at ${output}`);
    assert.deepEqual(readFileSync(sourcePath), sourceBefore,
      '[P0-B02] builder changed repository index.html');
    assert.deepEqual(readFileSync(savePath), saveBefore,
      '[P0-B02] builder changed repository js/save.js');
    assert.equal(existsSync(distPath), distBefore !== null,
      '[P0-B02] repository dist/index.html existence changed');
    if (distBefore) assert.deepEqual(readFileSync(distPath), distBefore,
      '[P0-B02] repository dist/index.html bytes changed');
  });
});

test('[P0-B02] unsafe overlapping output fails without changing source bytes', async () => {
  await withTemp(async (dir) => {
    const root = copyFixture(dir);
    const source = join(root, 'index.html');
    const before = readFileSync(source);
    for (const output of [root, join(root, 'js')]) {
      const result = build(root, output);
      assert.notEqual(result.status, 0,
        `[P0-B02] unsafe --out=${output} accepted with exit=0`);
      assert.deepEqual(readFileSync(source), before,
        `[P0-B02] unsafe --out=${output} modified input index.html`);
    }
  });
});

test('[P0-B09] the real builder accepts all three nested static import forms', async () => {
  await withTemp(async (dir) => {
    const root = copyFixture(dir);
    const out = join(dir, 'nested-output');
    expectSuccess('P0-B09', build(root, out));
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    assert.match(html, /window\.__p0NestedReady = true/,
      '[P0-B09] nested-entry ready signal missing from real merged build');
    assert.match(html, /const nestedValue = localValue \+ 11/,
      '[P0-B09] ../local.js dependency missing');
    assert.match(html, /const entryValue = localValue \+ nestedValue \+ 12/,
      '[P0-B09] ./dir/a.js dependency missing');
    assert.match(html, /const localValue = 10/,
      '[P0-B09] ./a.js dependency missing');
    assert.doesNotMatch(html, /<script type="module" src="js\/main\.js"><\/script>/,
      '[P0-B09] source module script still present after merge');
  });
});

const invalidBuilds = [
  {
    name: 'import cycle', file: 'js/core/local.js',
    append: "\nimport { entryValue } from './entry.js';\n",
    error: /cycle/i,
  },
  {
    name: 'top-level name clash', file: 'js/core/local.js',
    append: '\nexport const entryValue = 999;\n',
    error: /name|already been declared|redeclared/i,
  },
  {
    name: 'unsupported import', file: 'js/main.js',
    append: "\nimport './core/local.js';\n",
    error: /unsupported import|import form/i,
  },
  {
    name: 'dynamic import', file: 'js/main.js',
    append: "\nvoid import('./core/local.js');\n",
    error: /dynamic import|unsupported import|import\(/i,
  },
  {
    name: 'import outside js root', file: 'js/core/entry.js',
    append: "\nimport { forbidden } from '../../outside.js';\n",
    error: /outside|escape|unsupported import|invalid import/i,
  },
];

for (const item of invalidBuilds) {
  test(`[P0-B07] ${item.name} makes the real builder fail`, async () => {
    await withTemp(async (dir) => {
      const root = copyFixture(dir);
      const source = join(root, ...item.file.split('/'));
      writeFileSync(source, readFileSync(source, 'utf8') + item.append);
      const result = build(root, join(dir, 'rejected-output'));
      assert.notEqual(result.status, 0,
        `[P0-B07] ${item.name} returned exit=${result.status}; expected nonzero`);
      const output = `${result.stdout}\n${result.stderr}`;
      assert.match(output, item.error,
        `[P0-B07] ${item.name} failed for the wrong reason: ${output}`);
    });
  });
}
