// Check IDs: P0-B03, P0-B04, P0-B05, P0-B06, TR-01, TR-02, TR-03, TR-04, TR-05, TR-06, TR-07, TR-08
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURE = join(REPO, 'tests', 'fixtures', 'nested-entry');
const PINNED_VENDOR = '08fd7545d13d2c7fb65ab691530a802dafefd638596501854f267d0fb13c39e7';
const VENDOR = 'three-0.170.0.module.min.js';
const MAX_MS = 25_000;

function run(program, args, cwd, id) {
  const result = spawnSync(program, args, {
    cwd, encoding: 'utf8', timeout: MAX_MS, windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.error, undefined,
    `[${id}] process error=${String(result.error)}; command=${program} ${args.join(' ')}`);
  return result;
}

function git(repo, args, id = 'TR-07') {
  const result = run('git', args, repo, id);
  assert.equal(result.status, 0,
    `[${id}] git ${args.join(' ')} exit=${result.status}; stderr=${result.stderr}`);
  return result.stdout.trim();
}

function commit(repo, message) {
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.name=P0 Tester', '-c', 'user.email=p0@example.invalid',
    'commit', '-q', '-m', message]);
  return git(repo, ['rev-parse', 'HEAD']);
}

function packageVersion(repo, phase, versions, options = []) {
  const args = [join(repo, 'tools', 'package-version.mjs')];
  if (phase !== null) args.push(phase);
  args.push('--versions-dir', versions, ...options);
  return run(process.execPath, args, repo, 'TR-08');
}

function expectExit(id, result, expected) {
  assert.equal(result.status, expected,
    `[${id}] exit=${result.status}; expected=${expected}; stdout=${result.stdout}; stderr=${result.stderr}`);
}

function files(root) {
  if (!existsSync(root)) return [];
  const found = [];
  function visit(folder) {
    for (const item of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, item.name);
      if (item.isDirectory()) visit(path);
      else if (item.isFile()) found.push(path);
      else assert.fail(`[TR-01] nonregular artifact path=${path}`);
    }
  }
  visit(root);
  return found;
}

function snapshot(root) {
  if (!existsSync(root)) return [];
  const found = [];
  function visit(folder) {
    for (const item of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, item.name);
      const name = relative(root, path).split(sep).join('/');
      if (item.isDirectory()) {
        found.push([name + '/', '(directory)']);
        visit(path);
      } else if (item.isFile()) {
        const data = readFileSync(path);
        found.push([name, createHash('sha256').update(data).digest('hex')]);
      } else assert.fail(`[TR-03] unexpected artifact type=${path}`);
    }
  }
  visit(root);
  return found.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
}

function payloadHash(root) {
  const list = files(root).filter((path) => relative(root, path).split(sep).join('/') !== 'manifest.json');
  const names = list.map((path) => relative(root, path).split(sep).join('/'));
  assert.equal(new Set(names.map((name) => name.toLowerCase())).size, names.length,
    `[TR-01] case-insensitive path collision=${JSON.stringify(names)}`);
  const sorted = names.sort();
  const h = createHash('sha256');
  for (const name of sorted) {
    const data = readFileSync(join(root, ...name.split('/')));
    h.update(Buffer.from(`${name}\n${data.length}\n`, 'utf8'));
    h.update(data);
  }
  return h.digest('hex');
}

async function withRepo(action) {
  const root = mkdtempSync(join(tmpdir(), 'p0-package-contract-'));
  const repo = join(root, 'repo');
  const versions = join(root, 'versions');
  try {
    mkdirSync(repo);
    mkdirSync(versions);
    cpSync(FIXTURE, repo, { recursive: true });
    mkdirSync(join(repo, 'tools', 'vendor'), { recursive: true });
    cpSync(join(REPO, 'tools', 'build.mjs'), join(repo, 'tools', 'build.mjs'));
    assert.ok(existsSync(join(REPO, 'tools', 'package-version.mjs')),
      '[TR-08] tools/package-version.mjs is missing');
    cpSync(join(REPO, 'tools', 'package-version.mjs'), join(repo, 'tools', 'package-version.mjs'));
    cpSync(join(REPO, 'tools', 'vendor', VENDOR), join(repo, 'tools', 'vendor', VENDOR));
    mkdirSync(join(repo, 'audio'));
    writeFileSync(join(repo, 'audio', 'sample.mp3'), Buffer.from([0x49, 0x44, 0x33, 0x04]));
    const htmlPath = join(repo, 'index.html');
    writeFileSync(htmlPath, readFileSync(htmlPath, 'utf8').replace(
      '</body>', '<audio src="audio/sample.mp3"></audio>\n</body>'));
    writeFileSync(join(repo, 'js', 'gen2-s2-worker.js'),
      "import { workerAnswer } from './gen2-s2-runtime.js';\nself.onmessage = () => self.postMessage(workerAnswer);\n");
    writeFileSync(join(repo, 'js', 'gen2-s2-runtime.js'), 'export const workerAnswer = 42;\n');
    writeFileSync(join(repo, 'package.json'), JSON.stringify({
      name: 'p0-packaging-contract', private: true, type: 'module',
      scripts: { 'package:version': 'node tools/package-version.mjs' },
    }, null, 2) + '\n');
    git(repo, ['init', '-q']);
    const first = commit(repo, 'fixture: initial packaging input');
    return await action({ root, repo, versions, first });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function manifest(versions, phase) {
  return JSON.parse(readFileSync(join(versions, phase, 'manifest.json'), 'utf8'));
}

function checkManifest(versions, phase, commitSha) {
  const dir = join(versions, phase);
  const m = manifest(versions, phase);
  assert.equal(m.phase, phase, `[TR-02] manifest phase=${m.phase}; expected=${phase}`);
  assert.equal(m.commit, commitSha, `[TR-02] manifest commit=${m.commit}; expected=${commitSha}`);
  assert.match(m.payloadHash, /^[0-9a-f]{64}$/, `[TR-02] bad payloadHash=${m.payloadHash}`);
  assert.equal(m.payloadHash, payloadHash(dir),
    `[TR-01] independent hash mismatch: manifest=${m.payloadHash}; computed=${payloadHash(dir)}`);
  assert.ok(!Number.isNaN(Date.parse(m.builtAt)) && /Z$/.test(m.builtAt),
    `[TR-02] builtAt must be UTC ISO 8601, got=${m.builtAt}`);
  assert.ok(existsSync(join(dir, 'index.html')), `[P0-B03] missing index.html in ${dir}`);
  assert.ok(existsSync(join(dir, 'js', 'gen2-s2-worker.js')),
    `[P0-B06] missing packaged Worker in ${dir}`);
  assert.ok(existsSync(join(dir, 'js', 'gen2-s2-runtime.js')),
    `[P0-B06] missing packaged Worker import in ${dir}`);
  assert.ok(existsSync(join(dir, 'audio', 'sample.mp3')),
    `[P0-B06] missing audio asset in ${dir}`);
  const vendor = readFileSync(join(dir, 'vendor', VENDOR));
  const vendorHash = createHash('sha256').update(vendor).digest('hex');
  assert.equal(vendorHash, PINNED_VENDOR,
    `[TR-05] pinned Three.js hash=${vendorHash}; expected=${PINNED_VENDOR}`);
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.ok(html.includes(`./vendor/${VENDOR}`),
    `[TR-05] import map does not use local vendor/${VENDOR}`);
  assert.doesNotMatch(html, /https?:\/\//i,
    '[TR-05] packaged HTML has a remote URL');
  return m;
}

test('[P0-B03] [TR-01] [TR-02] [TR-05] packaging creates a complete hashed artifact', async () => {
  await withRepo(async ({ repo, versions, first }) => {
    const result = packageVersion(repo, 'p0-r1', versions);
    expectExit('P0-B03', result, 0);
    const m = checkManifest(versions, 'p0-r1', first);
    assert.match(result.stdout.trim().split(/\r?\n/).at(-1),
      new RegExp(`^package: p0-r1 ${m.payloadHash} `),
      `[TR-08] bad stdout last line=${result.stdout.trim().split(/\r?\n/).at(-1)}`);
  });
});

test('[P0-B04] [TR-01] same committed input produces identical payload in a second output folder', async () => {
  await withRepo(async ({ root, repo, versions, first }) => {
    const other = join(root, 'second-versions');
    mkdirSync(other);
    expectExit('P0-B04', packageVersion(repo, 'p0-r1', versions), 0);
    expectExit('P0-B04', packageVersion(repo, 'p0-r1', other), 0);
    const a = checkManifest(versions, 'p0-r1', first);
    const b = checkManifest(other, 'p0-r1', first);
    assert.equal(a.payloadHash, b.payloadHash,
      `[P0-B04] two independent builds disagree: ${a.payloadHash} vs ${b.payloadHash}`);
    assert.deepEqual(snapshot(join(versions, 'p0-r1')).filter(([p]) => p !== 'manifest.json'),
      snapshot(join(other, 'p0-r1')).filter(([p]) => p !== 'manifest.json'),
      '[P0-B04] artifact file bytes changed between independent builds');
  });
});

test('[P0-B05] [TR-03] [TR-04] candidates stay immutable; freezing uses the matched commit', async () => {
  await withRepo(async ({ repo, versions, first }) => {
    expectExit('P0-B05', packageVersion(repo, 'p0-r1', versions), 0);
    const candidateBytes = snapshot(join(versions, 'p0-r1'));
    const before = snapshot(versions);
    expectExit('P0-B05', packageVersion(repo, 'p0-r1', versions), 3);
    assert.deepEqual(snapshot(versions), before,
      '[TR-03] refused overwrite changed existing versions');
    writeFileSync(join(repo, 'unused.txt'), 'new committed file\n');
    const later = commit(repo, 'fixture: HEAD moved after candidate');
    assert.notEqual(later, first, '[TR-07] second commit failed to change HEAD');
    expectExit('TR-04', packageVersion(repo, 'p0', versions, ['--match', 'p0-r1']), 0);
    const frozen = checkManifest(versions, 'p0', first);
    assert.equal(frozen.payloadHash, manifest(versions, 'p0-r1').payloadHash,
      '[TR-04] frozen and candidate payload hashes differ');
    assert.deepEqual(snapshot(join(versions, 'p0')).filter(([p]) => p !== 'manifest.json'),
      candidateBytes.filter(([p]) => p !== 'manifest.json'),
      '[TR-04] frozen and candidate payload bytes differ');
    assert.deepEqual(snapshot(join(versions, 'p0-r1')), candidateBytes,
      '[P0-B05] freezing changed the candidate');
  });
});

test('[TR-04] [TR-03] explicit wrong commit and modified match hash fail without publishing', async () => {
  await withRepo(async ({ repo, versions }) => {
    expectExit('TR-04', packageVersion(repo, 'p0-r1', versions), 0);
    writeFileSync(join(repo, 'unused.txt'), 'different commit\n');
    commit(repo, 'fixture: second commit');
    const beforeWrong = snapshot(versions);
    expectExit('TR-04', packageVersion(repo, 'p0', versions,
      ['--match', 'p0-r1', '--commit', 'HEAD']), 1);
    assert.deepEqual(snapshot(versions), beforeWrong,
      '[TR-03] failed explicit commit match changed versions');
    const candidate = join(versions, 'p0-r1', 'manifest.json');
    const m = JSON.parse(readFileSync(candidate, 'utf8'));
    m.payloadHash = '0'.repeat(64);
    writeFileSync(candidate, JSON.stringify(m) + '\n');
    const beforeHash = snapshot(versions);
    expectExit('TR-04', packageVersion(repo, 'p0', versions, ['--match', 'p0-r1']), 1);
    assert.deepEqual(snapshot(versions), beforeHash,
      '[TR-03] failed hash match changed versions');
    assert.ok(!existsSync(join(versions, 'p0')),
      '[TR-04] an invalid matched artifact was published');
  });
});

test('[TR-06] [TR-08] invalid usage returns exit 2 and leaves output unchanged', async () => {
  await withRepo(async ({ repo, versions }) => {
    const cases = [
      [null, []],
      ['../p0', []], ['p5', []], ['p0-r0', []], ['p0-r01', []],
      ['p0', ['--unknown']], ['p0', ['--commit']],
      ['p0', ['--commit', 'not-a-real-ref']],
      ['p0', ['--commit', 'HEAD', '--commit', 'HEAD']],
      ['p0', ['--match', 'p0-r1', '--match', 'p0-r1']],
    ];
    for (const [phase, options] of cases) {
      const before = snapshot(versions);
      const result = packageVersion(repo, phase, versions, options);
      expectExit('TR-08', result, 2);
      assert.deepEqual(snapshot(versions), before,
        `[TR-03] invalid usage changed versions; phase=${phase}, options=${options}`);
    }
  });
});

test('[TR-08] official npm script calls the actual packaging CLI', async () => {
  await withRepo(async ({ repo, versions, first }) => {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(npm, ['run', 'package:version', '--', 'p0-r1',
      '--versions-dir', versions], {
      cwd: repo, encoding: 'utf8', timeout: MAX_MS, windowsHide: true,
      shell: process.platform === 'win32',
    });
    assert.equal(result.error, undefined, `[TR-08] npm error=${result.error}`);
    expectExit('TR-08', result, 0);
    checkManifest(versions, 'p0-r1', first);
  });
});

test('[TR-05] [TR-03] corrupt vendored Three.js fails without changing versions', async () => {
  await withRepo(async ({ repo, versions }) => {
    writeFileSync(join(repo, 'tools', 'vendor', VENDOR), 'corrupt vendor\n');
    commit(repo, 'fixture: corrupt vendored dependency');
    const before = snapshot(versions);
    expectExit('TR-05', packageVersion(repo, 'p0-r1', versions), 1);
    assert.deepEqual(snapshot(versions), before,
      '[TR-03] vendor rejection changed versions');
  });
});

test('[TR-07] the committed snapshot wins over uncommitted working-tree changes', async () => {
  await withRepo(async ({ repo, versions, first }) => {
    writeFileSync(join(repo, 'index.html'), 'not valid HTML\n');
    writeFileSync(join(repo, 'js', 'main.js'), 'this source is not valid JS!\n');
    expectExit('TR-07', packageVersion(repo, 'p0-r1', versions), 0);
    checkManifest(versions, 'p0-r1', first);
    const html = readFileSync(join(versions, 'p0-r1', 'index.html'), 'utf8');
    assert.doesNotMatch(html, /not valid HTML/,
      '[TR-07] package read an uncommitted source file');
  });
});

test('[TR-03] failed build or missing match leaves even existing artifacts unchanged', async () => {
  await withRepo(async ({ repo, versions }) => {
    expectExit('TR-03', packageVersion(repo, 'p0-r1', versions), 0);
    const before = snapshot(versions);
    expectExit('TR-08', packageVersion(repo, 'p0', versions, ['--match', 'p1']), 1);
    assert.deepEqual(snapshot(versions), before,
      '[TR-03] missing match changed versions');
    writeFileSync(join(repo, 'js', 'main.js'), "import { noSuch } from './does-not-exist.js';\n");
    commit(repo, 'fixture: bad build source');
    expectExit('TR-03', packageVersion(repo, 'p1', versions), 1);
    assert.deepEqual(snapshot(versions), before,
      '[TR-03] failed build changed versions');
  });
});

test('[TR-05] [TR-03] missing Worker dependency, referenced audio or remote CDN fails safely', async () => {
  const variants = [
    {
      name: 'missing Worker import',
      alter(repo) { rmSync(join(repo, 'js', 'gen2-s2-runtime.js')); },
    },
    {
      name: 'missing referenced audio',
      alter(repo) { rmSync(join(repo, 'audio', 'sample.mp3')); },
    },
    {
      name: 'external CDN script',
      alter(repo) {
        const path = join(repo, 'index.html');
        writeFileSync(path, readFileSync(path, 'utf8').replace(
          '</head>', '<script src="https://cdn.example.invalid/extra.js"></script>\n</head>'));
      },
    },
  ];
  for (const item of variants) {
    await withRepo(async ({ repo, versions }) => {
      item.alter(repo);
      commit(repo, `fixture: ${item.name}`);
      const before = snapshot(versions);
      const result = packageVersion(repo, 'p0-r1', versions);
      expectExit('TR-05', result, 1);
      assert.deepEqual(snapshot(versions), before,
        `[TR-03] failed ${item.name} changed versions; stderr=${result.stderr}`);
    });
  }
});
