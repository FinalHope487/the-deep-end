// Reviewer-only scratch Git repository and static server, adapted from P0 package
// tests and tests/phase/p1-worker-url.spec.js. Never changes the actual repo.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const P1_REPO = fileURLToPath(new URL('../../../', import.meta.url));
const VENDOR = 'three-0.170.0.module.min.js';

export function command(executable, args, cwd) {
  const result = spawnSync(executable, args, {
    cwd, encoding: 'utf8', timeout: 120000, windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, `${executable}: ${result.error}`);
  return result;
}

export function successful(result) {
  assert.equal(result.status, 0,
    `exit=${result.status}; stdout=${result.stdout}; stderr=${result.stderr}`);
}

export function put(root, name, data) {
  const file = join(root, ...name.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}

export function commitScratch(repo, message) {
  successful(command('git', ['add', '-A'], repo));
  successful(command('git', ['-c', 'user.name=P1 Test',
    '-c', 'user.email=p1-test@example.invalid', 'commit', '-q', '-m', message], repo));
  const rev = command('git', ['rev-parse', 'HEAD'], repo);
  successful(rev);
  return rev.stdout.trim();
}

export function createScratch() {
  const root = mkdtempSync(join(tmpdir(), 'p1-s4-'));
  const repo = join(root, 'repo');
  try {
    mkdirSync(repo);
    for (const name of ['index.html', 'tools/build.mjs', 'tools/package-version.mjs']) {
      put(repo, name, readFileSync(join(P1_REPO, ...name.split('/'))));
    }
    cpSync(join(P1_REPO, 'js'), join(repo, 'js'), { recursive: true });
    cpSync(join(P1_REPO, 'audio'), join(repo, 'audio'), { recursive: true });
    put(repo, `tools/vendor/${VENDOR}`,
      readFileSync(join(P1_REPO, 'tools/vendor', VENDOR)));
    successful(command('git', ['init', '-q'], repo));
    const commit = commitScratch(repo, 'fixture: actual P1 sources');
    return { root, repo, commit, cleanup: () => rmSync(root, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

export function packageScratch(repo, phase, extra = []) {
  return command(process.execPath, [join(repo, 'tools/package-version.mjs'),
    phase, '--versions-dir', join(repo, 'versions'), ...extra], repo);
}

export function manifestOf(repo, phase) {
  return JSON.parse(readFileSync(join(repo, 'versions', phase, 'manifest.json'), 'utf8'));
}

export async function serveScratch(repo) {
  const prefix = '/project/';
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.svg': 'image/svg+xml',
  };
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      if (!pathname.startsWith(prefix)) throw new Error('outside test mount');
      const suffix = pathname.slice(prefix.length) || 'index.html';
      let file = resolve(repo, suffix);
      const rel = relative(repo, file);
      if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new Error('outside scratch repository');
      }
      if (statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!existsSync(file)) throw new Error('not found');
      response.writeHead(200, {
        'Content-Type': types[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(readFileSync(file));
    } catch {
      response.writeHead(404);
      response.end('not found');
    }
  });
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', done);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done) => server.close(done)),
  };
}
