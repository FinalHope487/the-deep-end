// Package a committed revision as a self-contained archived artifact: versions/<phase>/ (index.html, js/, audio/, vendor/, manifest.json).
// usage (repo root): npm run package:version -- <phase> [--commit <rev>] [--versions-dir <dir>] [--match <phase>]
// Contract: docs/decisions/2026-11-06-v3-p0-engineering.md, section 3. Exit codes: 0 done, 1 check failed, 2 usage error, 3 target exists.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep, posix, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PHASE_RE = /^(p0|p1|p2|p2m|p3w|p3v|p3s|p3m|p3a|p3u|p4)(-r[1-9][0-9]*)?$/;
// Build target per phase base. A phase absent here has no implemented build and must not
// fall back to the v1 page. p0 keeps the default (v1) entry.
const PHASE_BUILD_FLAGS = Object.freeze({
  p0: Object.freeze([]),
  p1: Object.freeze(['--entry', 'js/v3/entry/main.js', '--html', 'js/v3/diagnostic/index.html']),
});
const VENDOR_NAME = 'three-0.170.0.module.min.js';
const VENDOR_SHA256 = '08fd7545d13d2c7fb65ab691530a802dafefd638596501854f267d0fb13c39e7';
const IMPORT_MAP = `<script type="importmap">\n{ "imports": { "three": "./vendor/${VENDOR_NAME}" } }\n</script>`;
// only these committed paths are exported; the build needs nothing else
const EXPORT_PATHS = (p) => p === 'index.html' || p.startsWith('js/') || p.startsWith('audio/') || p === 'tools/build.mjs' || p === `tools/vendor/${VENDOR_NAME}`;

class Fail extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const usage = (m) => new Fail(2, m);
const check = (m) => new Fail(1, m);

function parseArgs(argv) {
  const opts = {};
  let phase = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if (!['--commit', '--versions-dir', '--match'].includes(a)) throw usage(`unknown option ${a}`);
      if (a in opts) throw usage(`option ${a} given twice`);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw usage(`option ${a} needs a value`);
      opts[a] = v;
      i++;
    } else if (phase === null) phase = a;
    else throw usage(`unexpected argument ${a}`);
  }
  if (phase === null) throw usage('missing phase ID');
  if (!PHASE_RE.test(phase)) throw usage(`bad phase ID ${JSON.stringify(phase)}`);
  if (opts['--match'] !== undefined && !PHASE_RE.test(opts['--match'])) throw usage(`bad --match ID ${JSON.stringify(opts['--match'])}`);
  return { phase, commit: opts['--commit'], versionsDir: opts['--versions-dir'], match: opts['--match'] };
}

const git = (args, input) => spawnSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd: REPO, input, maxBuffer: 1 << 30, windowsHide: true });

function resolveCommit(rev, onBad) {
  const r = git(['rev-parse', '--verify', `${rev}^{commit}`]);
  if (r.status !== 0) throw onBad(`cannot resolve revision ${JSON.stringify(rev)}`);
  return r.stdout.toString('utf8').trim();
}

// write the needed committed files of `sha` into `dir` (raw blobs: no line-ending conversion, no working-tree file is read)
function exportTree(sha, dir) {
  const ls = git(['ls-tree', '-r', '-z', '--full-tree', sha]);
  if (ls.status !== 0) throw check(`git ls-tree failed: ${ls.stderr}`);
  const entries = ls.stdout.toString('utf8').split('\0').filter(Boolean).map((line) => {
    const tab = line.indexOf('\t');
    const [mode, type, obj] = line.slice(0, tab).split(' ');
    return { mode, type, obj, path: line.slice(tab + 1) };
  }).filter((e) => e.type === 'blob' && e.mode !== '120000' && EXPORT_PATHS(e.path));
  if (!entries.length) throw check('the revision has no packageable files');
  const cat = git(['cat-file', '--batch'], entries.map((e) => e.obj).join('\n') + '\n');
  if (cat.status !== 0) throw check(`git cat-file failed: ${cat.stderr}`);
  const out = cat.stdout;
  let pos = 0;
  for (const e of entries) {
    const nl = out.indexOf(0x0a, pos);
    const size = Number(out.subarray(pos, nl).toString('utf8').split(' ')[2]);
    const data = out.subarray(nl + 1, nl + 1 + size);
    pos = nl + 1 + size + 1;
    const file = join(dir, ...e.path.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data);
  }
}

function listFiles(root) {
  const found = [];
  const visit = (folder) => {
    for (const item of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, item.name);
      if (item.isDirectory()) visit(path);
      else if (item.isFile()) found.push(relative(root, path).split(sep).join('/'));
      else throw check(`artifact holds a non-regular file: ${path}`);
    }
  };
  visit(root);
  return found;
}

// TR-01: SHA-256 over, for each file except manifest.json in sorted path order: path, "\n", byte length, "\n", the bytes
function payloadHash(root) {
  const names = listFiles(root).filter((n) => n !== 'manifest.json');
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) throw check('two artifact paths differ only by letter case');
  const h = createHash('sha256');
  for (const name of names.sort()) {
    const data = readFileSync(join(root, ...name.split('/')));
    h.update(Buffer.from(`${name}\n${data.length}\n`, 'utf8'));
    h.update(data);
  }
  return h.digest('hex');
}

function labelFor(base, sha7) {
  return `${base.toUpperCase()}｜${base === 'p0' ? 'v1 封存版' : 'v3 封存版'}｜${sha7}`;
}

// version object, page title and a corner label (P0-L01). The archived page reads window.__deependVersion (router skip, save namespace).
function injectVersion(html, info) {
  const first = html.indexOf('<script');
  if (first < 0) throw check('index.html has no <script> tag');
  const snippet = `<script>
window.__deependVersion = ${JSON.stringify(info)};
document.title = window.__deependVersion.label;
document.addEventListener('DOMContentLoaded', function () {
  var el = document.createElement('div');
  el.id = 'version-label';
  el.textContent = window.__deependVersion.label;
  el.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:9999;font:12px/1 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,0.4);padding:4px 6px;border-radius:4px;pointer-events:none';
  document.body.appendChild(el);
});
</script>
`;
  let out = html.slice(0, first) + snippet + html.slice(first);
  // the real element is the last one: an inline script (the router) may hold a "<title>" string before it
  const at = out.lastIndexOf('<title>');
  const end = at < 0 ? -1 : out.indexOf('</title>', at);
  if (end < 0) throw check('index.html has no <title> element');
  return out.slice(0, at) + `<title>${info.label}</title>` + out.slice(end + '</title>'.length);
}

function rewriteImportMap(html) {
  const maps = html.match(/<script type="importmap">[\s\S]*?<\/script>/g) || [];
  if (maps.length !== 1) throw check(`index.html needs exactly one import map, found ${maps.length}`);
  return html.replace(maps[0], () => IMPORT_MAP);
}

// exit 1 checks on the finished artifact: no external dependency, every referenced local file exists
function verifyArtifact(dir) {
  const htmlPath = join(dir, 'index.html');
  if (!existsSync(htmlPath)) throw check('artifact has no index.html');
  const html = readFileSync(htmlPath, 'utf8');
  const jsNames = listFiles(join(dir, 'js')).filter((n) => n.endsWith('.js'));
  if (!existsSync(join(dir, 'js', 'gen2-s2-worker.js'))) throw check('missing Worker file js/gen2-s2-worker.js');
  if (!existsSync(join(dir, 'audio')) || !listFiles(join(dir, 'audio')).length) throw check('audio/ is missing or empty');
  if (!existsSync(join(dir, 'vendor', VENDOR_NAME))) throw check(`missing vendor/${VENDOR_NAME}`);
  for (const m of html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)) {
    let map;
    try { map = JSON.parse(m[1]); } catch { throw check('import map is not valid JSON'); }
    for (const url of Object.values(map.imports || {})) if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) throw check(`import map points outside the artifact: ${url}`);
  }
  if (/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i.test(html)) throw check('index.html loads an external script or stylesheet');
  const texts = [['index.html', html], ...jsNames.map((n) => [`js/${n}`, readFileSync(join(dir, 'js', ...n.split('/')), 'utf8')])];
  for (const [name, text] of texts) {
    if (/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]https?:\/\//.test(text)) throw check(`${name} imports from an external URL`);
    if (/cdn\.jsdelivr\.net|unpkg\.com/.test(text)) throw check(`${name} names an external CDN`);
  }
  // local files named by index.html (src/href that are neither anchors, data URIs nor absolute URLs)
  for (const m of html.matchAll(/<(?:script|link|audio|img|source|video|iframe)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const ref = m[1];
    if (/^(?:data:|#)/i.test(ref)) continue;
    if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(ref)) throw check(`index.html depends on an external resource: ${ref}`);
    let path;
    try { path = decodeURIComponent(ref.split(/[?#]/)[0]); } catch { throw check(`index.html has an invalid resource URL: ${ref}`); }
    const file = resolve(dir, path);
    const rel = relative(dir, file);
    if (!path || path.startsWith('/') || path.includes('\\') || !rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !existsSync(file)) {
      throw check(`index.html references a missing file or one outside the artifact: ${ref}`);
    }
  }
  // audio files that js/audio.js loads at run time (Web Audio fetches them; a gap shows up only as silence in play)
  const audioSource = join(dir, 'js', 'audio.js');
  if (existsSync(audioSource)) {
    const block = /\bconst AUDIO_FILES\s*=\s*\{([\s\S]*?)\};/.exec(readFileSync(audioSource, 'utf8'));
    if (!block) throw check('js/audio.js has no AUDIO_FILES table to verify');
    const names = [...block[1].matchAll(/:\s*['"]([^'"]+\.mp3)['"]/g)].map((x) => x[1]);
    if (!names.length) throw check('AUDIO_FILES names no audio files');
    for (const name of names) {
      if (/[\\/]|\.\./.test(name) || !existsSync(join(dir, 'audio', name))) throw check(`missing required audio file: ${name}`);
    }
  }
  // relative imports between packaged js files (the Worker loads its modules this way)
  for (const n of jsNames) {
    const text = readFileSync(join(dir, 'js', ...n.split('/')), 'utf8');
    for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = posix.normalize(posix.join(posix.dirname(n), m[1]));
      if (target.startsWith('../') || isAbsolute(target) || !existsSync(join(dir, 'js', ...target.split('/')))) throw check(`js/${n} imports a missing module: ${m[1]}`);
    }
  }
}

function readManifest(versionsDir, id) {
  let m;
  try { m = JSON.parse(readFileSync(join(versionsDir, id, 'manifest.json'), 'utf8')); } catch { throw check(`cannot read manifest of ${id}`); }
  if (m?.phase !== id || !/^[0-9a-f]{40}$/.test(m.commit) || !/^[0-9a-f]{64}$/.test(m.payloadHash)) throw check(`manifest of ${id} is invalid`);
  // the files a user played must be the files the manifest names, or a freeze would bless something else
  let actual;
  try { actual = payloadHash(join(versionsDir, id)); } catch (e) { throw check(`cannot verify payload of ${id}: ${e.message}`); }
  if (actual !== m.payloadHash) throw check(`payload of ${id} differs from its manifest: actual=${actual}, expected=${m.payloadHash}`);
  return m;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  const versionsDir = resolve(REPO, a.versionsDir ?? 'versions');
  const target = join(versionsDir, a.phase);
  const inside = relative(versionsDir, target);
  if (!inside || inside.startsWith('..') || isAbsolute(inside) || inside.includes(sep)) throw usage('target leaves the versions folder');

  let explicit = null;
  if (a.commit !== undefined) explicit = resolveCommit(a.commit, usage);
  if (existsSync(target)) throw new Fail(3, `${a.phase} already exists in ${versionsDir}`);

  let matched = null;
  if (a.match !== undefined) {
    matched = readManifest(versionsDir, a.match);
    if (explicit && explicit !== matched.commit) throw check(`--commit ${explicit} differs from the commit of ${a.match} (${matched.commit})`);
  }
  const sha = matched ? matched.commit : (explicit ?? resolveCommit('HEAD', check));
  const base = a.phase.replace(/-r[1-9][0-9]*$/, '');
  const buildFlags = PHASE_BUILD_FLAGS[base];
  if (!buildFlags) throw check(`phase ${base} has no implemented build target`);

  const madeVersionsDir = !existsSync(versionsDir);
  mkdirSync(versionsDir, { recursive: true });
  const tmp = join(versionsDir, `.tmp-${a.phase}-${randomBytes(4).toString('hex')}`);
  try {
    const src = join(tmp, 'src'), art = join(tmp, 'artifact');
    mkdirSync(src, { recursive: true });
    exportTree(sha, src);
    const vendorFile = join(src, 'tools', 'vendor', VENDOR_NAME);
    if (!existsSync(vendorFile)) throw check(`the revision has no tools/vendor/${VENDOR_NAME}`);
    const vendor = readFileSync(vendorFile);
    const vendorHash = createHash('sha256').update(vendor).digest('hex');
    if (vendorHash !== VENDOR_SHA256) throw check(`vendored Three.js hash ${vendorHash} differs from the pinned ${VENDOR_SHA256}`);
    if (!existsSync(join(src, 'tools', 'build.mjs'))) throw check('the revision has no tools/build.mjs');
    try {
      execFileSync(process.execPath, [join(src, 'tools', 'build.mjs'), '--root', src, '--out', art, ...buildFlags], { stdio: 'pipe' });
    } catch (e) {
      throw check(`build failed: ${String(e.stderr || e.message).trim().split('\n').slice(0, 6).join(' | ')}`);
    }
    mkdirSync(join(art, 'vendor'), { recursive: true });
    writeFileSync(join(art, 'vendor', VENDOR_NAME), vendor);
    const sha7 = sha.slice(0, 7);
    const info = { phase: base, base, ns: base, sha7, label: labelFor(base, sha7) };
    const htmlPath = join(art, 'index.html');
    writeFileSync(htmlPath, injectVersion(rewriteImportMap(readFileSync(htmlPath, 'utf8')), info));
    verifyArtifact(art);
    const payload = payloadHash(art);
    if (matched && matched.payloadHash !== payload) throw check(`payload hash ${payload} differs from ${a.match} (${matched.payloadHash})`);
    writeFileSync(join(art, 'manifest.json'), JSON.stringify({ phase: a.phase, commit: sha, payloadHash: payload, builtAt: new Date().toISOString() }, null, 2) + '\n');
    if (existsSync(target)) throw new Fail(3, `${a.phase} already exists in ${versionsDir}`);
    renameSync(art, target);
    console.log(`package: ${a.phase} ${payload} ${target}`);
  } catch (e) {
    if (madeVersionsDir) rmSync(versionsDir, { recursive: true, force: true });
    throw e;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

try {
  main();
} catch (e) {
  if (!(e instanceof Fail)) { console.error(`package: unexpected error: ${e?.stack ?? e}`); process.exit(1); }
  console.error(`package: ${e.message}`);
  process.exit(e.code);
}
