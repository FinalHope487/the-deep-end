// Merge index.html + js/**/*.js into a single dist/index.html (audio/ is copied next to it).
// usage (repo root): node tools/build.mjs [--root DIR] [--out DIR] [--entry js/<path>.js] [--html <path>.html]
//   defaults: repo root, <root>/dist, js/main.js, index.html
//   --entry / --html select "v3 mode": the whole js/ tree is copied next to the merged page (Workers load from it);
//   the default build never ships js/v3/, so it stays byte-identical to the P0 freeze.
//   exit codes: 2 = usage error (bad or repeated flag), 1 = source, path or template error
//
// Rules the source modules follow so plain concatenation works:
// - local imports are single-line named imports:  import { a, b } from './x.js';  (also './dir/x.js' and '../x.js'; the
//   target must stay inside js/)
// - the only bare import is:                      import * as THREE from 'three';
// - no dynamic import(...) call
// - `export` appears only as a declaration prefix (export function / class / const / let)
// - top-level names are unique across modules (checked here; a clash fails the build)
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, mkdtempSync, realpathSync, statSync, lstatSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve, relative, isAbsolute, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

function fail(msg) {
  console.error('build: ' + msg);
  process.exit(1);
}

function usage(msg) {
  console.error(`build: ${msg}\nusage: node tools/build.mjs [--root DIR] [--out DIR] [--entry js/<path>.js] [--html <path>.html]`);
  process.exit(2);
}

// every flag takes exactly one value and may appear once
const flags = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const flag = process.argv[i], value = process.argv[i + 1];
  if (!['--root', '--out', '--entry', '--html'].includes(flag)) usage(`unknown argument ${flag}`);
  if (flags.has(flag)) usage(`${flag} was given twice`);
  if (value === undefined || value.startsWith('--')) usage(`${flag} needs a value`);
  flags.set(flag, value);
}
const ROOT = resolve(flags.get('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const JS = join(ROOT, 'js');
const DIST = resolve(flags.get('--out') ?? join(ROOT, 'dist'));
const V3_MODE = flags.has('--entry') || flags.has('--html');
const ENTRY = flags.get('--entry') ?? 'js/main.js';
const HTML_REL = flags.get('--html') ?? 'index.html';

const inside = (a, b) => { const r = relative(b, a); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };
// a path flag is a POSIX path made of plain segments; it never leaves its base folder
const plainPosix = (p) => p !== '' && !p.includes('\\') && !posix.isAbsolute(p) && !/^[a-zA-Z]:/.test(p)
  && p.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
if (!plainPosix(ENTRY) || !/^js\/.+\.js$/.test(ENTRY)) fail(`--entry ${ENTRY} must be a POSIX path 'js/<path>.js'`);
if (!plainPosix(HTML_REL)) fail(`--html ${HTML_REL} must be a POSIX path inside ${ROOT}`);
const HTML_FILE = join(ROOT, ...HTML_REL.split('/'));
const HTML_DIR = dirname(HTML_FILE);
// Real path of the nearest existing ancestor plus the missing tail. A path reached through a symlink or
// junction is compared as what it really is, so --out cannot alias the sources.
function canonical(path) {
  const tail = [];
  for (let cur = path; ; cur = dirname(cur)) {
    try { return join(realpathSync.native(cur), ...tail); }
    catch (e) {
      const up = dirname(cur);
      if (e.code !== 'ENOENT' || up === cur || lstatSync(cur, { throwIfNoEntry: false })) fail(`cannot resolve ${path}`);
      tail.unshift(basename(cur));
    }
  }
}
// the output folder is wiped (audio/) and overwritten (index.html): it must not overlap the sources or the template
const REAL = { root: canonical(ROOT), js: canonical(JS), audio: canonical(join(ROOT, 'audio')),
  out: canonical(DIST), htmlDir: canonical(HTML_DIR) };
if (inside(REAL.root, REAL.out) || inside(REAL.out, REAL.js) || inside(REAL.out, REAL.audio)
  || (REAL.htmlDir !== REAL.root && (inside(REAL.out, REAL.htmlDir) || inside(REAL.htmlDir, REAL.out)))) {
  fail(`--out ${DIST} overlaps the sources in ${ROOT}`);
}

// real-path checks: a symlink or junction under js/ must not lead outside the real root
function realInside(file, base, what) {
  let real, realBase;
  try { real = realpathSync.native(file); realBase = realpathSync.native(base); }
  catch { fail(`${what} cannot be resolved: ${file}`); }
  if (!inside(real, realBase)) fail(`${what} resolves outside ${base}: ${file}`);
}
// v3 mode copies js/ as it is, so a link inside it would leave the artifact pointing outside
function assertNoLinks(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isSymbolicLink()) fail(`${path} is a link; v3 mode copies js/ and cannot ship links`);
    if (item.isDirectory()) assertNoLinks(path);
  }
}

const LOCAL_IMPORT = /^import\s*\{[^}]*\}\s*from\s*'((?:\.{1,2}\/)+(?:[\w-]+\/)*[\w-]+\.js)';[ \t]*\r?$/gm;
const THREE_IMPORT = /^import \* as THREE from 'three';[ \t]*\r?$/gm;
const ANY_IMPORT = /^\s*import\b/m;
// whitespace and comments may sit between `import` and `(`
const DYNAMIC_IMPORT = /(?<![\w$.])import(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))*\(/;
const BAD_EXPORT = /^export\s*(\{|default|\*)/m;
const EXPORT_DECL = /^export (?=(async )?(function|class|const|let)\b)/gm;
const TOP_DECL = /^(?:async )?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;

// a module is named by its POSIX path under js/ (`main.js`, `core/entry.js`)
function resolveImport(from, spec) {
  const target = posix.normalize(posix.join(posix.dirname(from), spec));
  if (target === '..' || target.startsWith('../') || posix.isAbsolute(target)) fail(`${from}: import '${spec}' escapes the js folder`);
  return target;
}

function orderModules(entry) {
  const seen = new Set(), out = [];
  const visit = (name, stack) => {
    if (stack.includes(name)) fail('import cycle: ' + [...stack, name].join(' -> '));
    if (seen.has(name)) return;
    const file = join(JS, ...name.split('/'));
    if (!existsSync(file)) fail(`${stack.at(-1) ?? 'entry'}: imported module ${name} does not exist`);
    realInside(file, JS, `module ${name}`);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(LOCAL_IMPORT)) visit(resolveImport(name, m[1]), [...stack, name]);
    seen.add(name);
    out.push(name);
  };
  visit(entry, []);
  return out;
}

function stripModule(name) {
  let src = readFileSync(join(JS, ...name.split('/')), 'utf8').replace(LOCAL_IMPORT, '').replace(THREE_IMPORT, '');
  if (ANY_IMPORT.test(src)) fail(`${name}: unsupported import form (only named './x.js' imports and THREE are allowed)`);
  if (DYNAMIC_IMPORT.test(src)) fail(`${name}: dynamic import() is not allowed`);
  if (BAD_EXPORT.test(src)) fail(`${name}: only \`export function/class/const/let\` declarations are allowed`);
  return src.replace(EXPORT_DECL, '');
}

if (!existsSync(HTML_FILE) || !statSync(HTML_FILE).isFile()) fail(`--html ${HTML_REL} is not a file under ${ROOT}`);
realInside(HTML_FILE, ROOT, `template ${HTML_REL}`);
realInside(JS, ROOT, 'js folder');
// js/ itself may not be a link either: readdir/cpSync would follow it and the copy would depend on its target
if (lstatSync(JS).isSymbolicLink()) fail(`${JS} is a link; js/ must be a real folder`);
if (V3_MODE) assertNoLinks(JS);
const html = readFileSync(HTML_FILE, 'utf8');
// the entry tag is either a src script or an inline import; the inline form hides the entry from the browser's
// preload scanner, so a routed ?gen=v3 page never requests the default game's module
const TAGS = [`<script type="module" src="${ENTRY}"></script>`, `<script type="module">import './${ENTRY}';</script>`];
const TAG = TAGS.find((t) => html.includes(t));
if (!TAG) fail(`${HTML_REL} no longer loads ${ENTRY}`);
// the entry runs once: count both accepted forms together
if (TAGS.reduce((n, t) => n + html.split(t).length - 1, 0) !== 1) fail(`${HTML_REL} must contain the entry tag exactly once`);
const modules = orderModules(ENTRY.slice('js/'.length));
const owners = new Map();
const parts = ["import * as THREE from 'three';"];
for (const m of modules) {
  const body = stripModule(m);
  for (const d of body.matchAll(TOP_DECL)) {
    if (owners.has(d[1])) fail(`top-level name \`${d[1]}\` defined in both ${owners.get(d[1])} and ${m}`);
    owners.set(d[1], m);
  }
  parts.push(`// ---- ${m} ----\n${body.trim()}\n`);
}
const script = parts.join('\n').replaceAll('</script', '<\\/script');

// the engine is the final judge: clashes the regex cannot see (`const a = 1, WALL = 2`) are a SyntaxError here
const checkDir = mkdtempSync(join(tmpdir(), 'deepend-check-'));
try {
  writeFileSync(join(checkDir, 'merged.mjs'), script);
  execFileSync(process.execPath, ['--check', join(checkDir, 'merged.mjs')], { stdio: 'pipe' });
} catch (e) {
  fail('merged script does not parse:\n' + String(e.stderr || e.message).split('\n').slice(0, 6).join('\n'));
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}
const out = html.replace(TAG, () => '<script type="module">\n' + script + '\n</script>');
// every path written or wiped below must be a real entry of the output folder: a link left there by an earlier
// run would send the write (index.html), the copy (js/) or the wipe (audio/) into another folder
for (const name of ['index.html', 'js', 'audio']) {
  if (lstatSync(join(DIST, name), { throwIfNoEntry: false })?.isSymbolicLink()) fail(`${join(DIST, name)} is a link; remove it or choose another --out`);
}
mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, 'index.html'), out);
// Module Workers keep their own scope and load source modules beside the merged entry.
// The default build never ships js/v3/ (P0 freeze identity); v3 mode copies the whole tree.
const notV3 = (p) => !inside(p, join(JS, 'v3'));
if (V3_MODE) cpSync(JS, join(DIST, 'js'), { recursive: true });
else if (existsSync(join(JS, 'gen2-s2-worker.js'))) cpSync(JS, join(DIST, 'js'), { recursive: true, filter: notV3 });
rmSync(join(DIST, 'audio'), { recursive: true, force: true });
if (existsSync(join(ROOT, 'audio'))) cpSync(join(ROOT, 'audio'), join(DIST, 'audio'), { recursive: true, filter: (p) => !p.endsWith('.md') });
console.log(`build: dist/index.html (${Math.round(out.length / 1024)} KB, ${modules.length} modules: ${modules.join(', ')})`);
