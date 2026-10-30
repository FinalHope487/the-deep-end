// Merge index.html + js/*.js into a single dist/index.html (audio/ is copied next to it).
// usage (repo root): node tools/build.mjs [--root DIR] [--out DIR]   (defaults: repo root, <root>/dist)
//
// Rules the source modules follow so plain concatenation works:
// - local imports are single-line named imports:  import { a, b } from './x.js';
// - the only bare import is:                      import * as THREE from 'three';
// - `export` appears only as a declaration prefix (export function / class / const / let)
// - top-level names are unique across modules (checked here; a clash fails the build)
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, mkdtempSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

function fail(msg) {
  console.error('build: ' + msg);
  process.exit(1);
}

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  if (i < 0) return dflt;
  if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) fail(`${name} needs a folder`);
  return resolve(process.argv[i + 1]);
};
const ROOT = arg('--root', join(dirname(fileURLToPath(import.meta.url)), '..'));
const JS = join(ROOT, 'js');
const DIST = arg('--out', join(ROOT, 'dist'));
// the output folder is wiped (audio/) and overwritten (index.html): it must not overlap the sources
const inside = (a, b) => { const r = relative(b, a); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };
if (inside(ROOT, DIST) || inside(DIST, JS) || inside(DIST, join(ROOT, 'audio'))) fail(`--out ${DIST} overlaps the sources in ${ROOT}`);

const LOCAL_IMPORT = /^import\s*\{[^}]*\}\s*from\s*'\.\/([\w-]+\.js)';[ \t]*\r?$/gm;
const THREE_IMPORT = /^import \* as THREE from 'three';[ \t]*\r?$/gm;
const ANY_IMPORT = /^\s*import\b/m;
const BAD_EXPORT = /^export\s*(\{|default|\*)/m;
const EXPORT_DECL = /^export (?=(async )?(function|class|const|let)\b)/gm;
const TOP_DECL = /^(?:async )?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;

function orderModules(entry) {
  const seen = new Set(), out = [];
  const visit = (name, stack) => {
    if (stack.includes(name)) fail('import cycle: ' + [...stack, name].join(' -> '));
    if (seen.has(name)) return;
    const src = readFileSync(join(JS, name), 'utf8');
    for (const m of src.matchAll(LOCAL_IMPORT)) visit(m[1], [...stack, name]);
    seen.add(name);
    out.push(name);
  };
  visit(entry, []);
  return out;
}

function stripModule(name) {
  let src = readFileSync(join(JS, name), 'utf8').replace(LOCAL_IMPORT, '').replace(THREE_IMPORT, '');
  if (ANY_IMPORT.test(src)) fail(`${name}: unsupported import form (only named './x.js' imports and THREE are allowed)`);
  if (BAD_EXPORT.test(src)) fail(`${name}: only \`export function/class/const/let\` declarations are allowed`);
  return src.replace(EXPORT_DECL, '');
}

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const TAG = '<script type="module" src="js/main.js"></script>';
if (!html.includes(TAG)) fail('index.html no longer loads js/main.js');
const modules = orderModules('main.js');
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
mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, 'index.html'), out);
// Module Workers keep their own scope and load source modules beside the merged entry.
if (existsSync(join(JS, 'gen2-s2-worker.js'))) cpSync(JS, join(DIST, 'js'), { recursive: true });
rmSync(join(DIST, 'audio'), { recursive: true, force: true });
if (existsSync(join(ROOT, 'audio'))) cpSync(join(ROOT, 'audio'), join(DIST, 'audio'), { recursive: true, filter: (p) => !p.endsWith('.md') });
console.log(`build: dist/index.html (${Math.round(out.length / 1024)} KB, ${modules.length} modules: ${modules.join(', ')})`);
