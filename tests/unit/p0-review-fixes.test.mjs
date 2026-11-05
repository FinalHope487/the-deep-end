// Check IDs: P0-B06, P0-B07, TR-04, TR-05
// Implementer-written regression tests for the cold review c2c_p0r1 (findings 1-4).
// They add to, and never edit, the reviewer-delivered P0 tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURE = join(REPO, 'tests', 'fixtures', 'nested-entry');
const VENDOR = 'three-0.170.0.module.min.js';

function run(program, args, cwd) {
  const r = spawnSync(program, args, { cwd, encoding: 'utf8', timeout: 25_000, windowsHide: true });
  assert.equal(r.error, undefined, `process error=${String(r.error)}`);
  return r;
}

function git(repo, args) {
  const r = run('git', args, repo);
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

// a throw-away git repository: the nested-entry fixture plus the real builder, packager and vendored Three.js
function withRepo(edit, action) {
  const root = mkdtempSync(join(tmpdir(), 'p0-review-fixes-'));
  const repo = join(root, 'repo');
  const versions = join(root, 'versions');
  try {
    mkdirSync(repo);
    mkdirSync(versions);
    cpSync(FIXTURE, repo, { recursive: true });
    mkdirSync(join(repo, 'tools', 'vendor'), { recursive: true });
    cpSync(join(REPO, 'tools', 'build.mjs'), join(repo, 'tools', 'build.mjs'));
    cpSync(join(REPO, 'tools', 'package-version.mjs'), join(repo, 'tools', 'package-version.mjs'));
    cpSync(join(REPO, 'tools', 'vendor', VENDOR), join(repo, 'tools', 'vendor', VENDOR));
    mkdirSync(join(repo, 'audio'));
    writeFileSync(join(repo, 'audio', 'sample.mp3'), Buffer.from([0x49, 0x44, 0x33, 0x04]));
    writeFileSync(join(repo, 'js', 'gen2-s2-worker.js'),
      "import { workerAnswer } from './gen2-s2-runtime.js';\nself.onmessage = () => self.postMessage(workerAnswer);\n");
    writeFileSync(join(repo, 'js', 'gen2-s2-runtime.js'), 'export const workerAnswer = 42;\n');
    edit?.(repo);
    git(repo, ['init', '-q']);
    git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'fixture']);
    return action({ repo, versions });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function pack(repo, versions, phase, extra = []) {
  return run(process.execPath, [join(repo, 'tools', 'package-version.mjs'), phase, '--versions-dir', versions, ...extra], repo);
}

function addToHtml(repo, snippet) {
  const path = join(repo, 'index.html');
  writeFileSync(path, readFileSync(path, 'utf8').replace('</body>', `${snippet}\n</body>`));
}

test('[TR-04] freezing fails when the candidate files no longer match their manifest', () => {
  withRepo(null, ({ repo, versions }) => {
    assert.equal(pack(repo, versions, 'p0-r1').status, 0, 'candidate must package');
    const page = join(versions, 'p0-r1', 'index.html');
    writeFileSync(page, readFileSync(page, 'utf8') + '\n<!-- tampered -->\n');
    const r = pack(repo, versions, 'p0', ['--match', 'p0-r1']);
    assert.equal(r.status, 1, `exit=${r.status}; stderr=${r.stderr}`);
    assert.ok(!existsSync(join(versions, 'p0')), '[TR-04] frozen p0 was published from a tampered candidate');
  });
});

test('[TR-05] [P0-B06] packaging fails when js/audio.js names an audio file that is missing', () => {
  withRepo((repo) => {
    writeFileSync(join(repo, 'js', 'audio.js'),
      "const AUDIO_FILES = {\n  a: 'sample.mp3', b: 'missing.mp3',\n};\n");
  }, ({ repo, versions }) => {
    const r = pack(repo, versions, 'p0-r1');
    assert.equal(r.status, 1, `exit=${r.status}; stdout=${r.stdout}; stderr=${r.stderr}`);
    assert.match(r.stderr, /missing\.mp3/, `error must name the file: ${r.stderr}`);
    assert.ok(!existsSync(join(versions, 'p0-r1')), 'failed packaging must not publish');
  });
});

test('[TR-05] packaging fails on an external audio URL', () => {
  withRepo((repo) => addToHtml(repo, '<audio src="https://cdn.example.invalid/sound.mp3"></audio>'),
    ({ repo, versions }) => {
      const r = pack(repo, versions, 'p0-r1');
      assert.equal(r.status, 1, `exit=${r.status}; stdout=${r.stdout}; stderr=${r.stderr}`);
      assert.ok(!existsSync(join(versions, 'p0-r1')), 'failed packaging must not publish');
    });
});

test('[P0-L01] the static <title> element carries the label, not text inside a script', () => {
  withRepo((repo) => {
    const path = join(repo, 'index.html');
    // like the real router, which holds a "<title>" string inside an inline script before the real element
    writeFileSync(path, readFileSync(path, 'utf8').replace('<head>', "<head>\n<script>var s = '<title>decoy</title>';</script>"));
  }, ({ repo, versions }) => {
    assert.equal(pack(repo, versions, 'p0-r1').status, 0, 'candidate must package');
    const html = readFileSync(join(versions, 'p0-r1', 'index.html'), 'utf8');
    const m = /<head>[\s\S]*?<\/head>/.exec(html)[0];
    const real = m.replace(/<script[\s\S]*?<\/script>/g, '');
    assert.match(real, /<title>P0｜v1 封存版｜[0-9a-f]{7}<\/title>/, `static title not labelled; head without scripts=${real}`);
    assert.match(html, /<title>decoy<\/title>/, 'script text must stay untouched');
  });
});

test('[P0-B07] a dynamic import with a comment before the parenthesis makes the builder fail', () => {
  withRepo((repo) => {
    const path = join(repo, 'js', 'main.js');
    writeFileSync(path, readFileSync(path, 'utf8') + "\nconst later = import/* c */('./core/local.js');\n");
  }, ({ repo }) => {
    const r = run(process.execPath, [join(repo, 'tools', 'build.mjs'), '--root', repo, '--out', join(repo, '..', 'out')], repo);
    assert.notEqual(r.status, 0, `exit=${r.status}; builder accepted a hidden dynamic import`);
    assert.match(`${r.stdout}\n${r.stderr}`, /dynamic import/i);
  });
});
