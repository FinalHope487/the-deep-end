// Check IDs: P0-D02
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WORKFLOW = fileURLToPath(new URL('../../.github/workflows/pages.yml', import.meta.url));
const text = readFileSync(WORKFLOW, 'utf8').replace(/\r\n/g, '\n');

function requireMatch(expression, why) {
  assert.match(text, expression,
    `[P0-D02] ${why}; workflow=${WORKFLOW}`);
}

function position(expression, why) {
  const match = expression.exec(text);
  assert.ok(match,
    `[P0-D02] missing ${why}; pattern=${expression}; workflow=${WORKFLOW}`);
  return match.index;
}

test('[P0-D02] Pages runs on main and uploads the built dist directory', () => {
  requireMatch(/^name:\s*pages\s*$/m, 'workflow name must be pages');
  requireMatch(/^on:\s*$/m, 'workflow must define trigger on:');
  requireMatch(/^\s+push:\s*$/m, 'workflow must deploy after push');
  requireMatch(/^\s+branches:\s*\[main\]\s*$/m, 'push branch must be main');
  requireMatch(/actions\/checkout@v4/, 'workflow must check out the revision');
  requireMatch(/actions\/upload-pages-artifact@v3/, 'workflow must upload Pages artifact');
  requireMatch(/actions\/deploy-pages@v4/, 'workflow must deploy Pages artifact');
  requireMatch(/^\s+path:\s*dist\/?\s*$/m, 'Pages artifact must be dist');
});

test('[P0-D02] version copy runs after build and before Pages upload', () => {
  const build = position(/^\s*-\s*run:\s*node\s+tools\/build\.mjs\s*$/m,
    'default release build step');
  const upload = position(/^\s*-\s*uses:\s*actions\/upload-pages-artifact@v3\s*$/m,
    'Pages upload step');
  const segment = text.slice(build, upload);
  const src = /\bversions\//.exec(segment);
  const target = /\bdist\/versions\//.exec(segment);
  assert.ok(src,
    `[P0-D02] missing versions/ source between build and upload; segment=${segment}`);
  assert.ok(target,
    `[P0-D02] missing dist/versions/ destination between build and upload; segment=${segment}`);
  assert.ok(src.index < target.index,
    `[P0-D02] source appears after destination; srcIndex=${src.index}, destIndex=${target.index}`);
  assert.ok(build < upload,
    `[P0-D02] buildIndex=${build}; uploadIndex=${upload}`);
  assert.match(segment, /(?:\bcp\b|\brsync\b|\bcopy\b|\bCopy-Item\b)/,
    `[P0-D02] no explicit copy operation from versions/ to dist/versions/; segment=${segment}`);
  assert.match(segment, /(?:\bif\b|\btest\b|\bexists\b|\bTest-Path\b)[^\n]*\bversions\/?/,
    `[P0-D02] optional versions/ folder is not checked before copying; segment=${segment}`);
});

test('[P0-D02] publishing versions preserves the legacy build and deployment steps', () => {
  const build = position(/node\s+tools\/build\.mjs/, 'default build');
  const legacy = position(/node\s+legacy-src\/tools\/build\.mjs/, 'legacy build');
  const upload = position(/actions\/upload-pages-artifact@v3/, 'Pages upload');
  const deploy = position(/actions\/deploy-pages@v4/, 'Pages deployment');
  assert.ok(build < legacy && legacy < upload && upload < deploy,
    `[P0-D02] step order invalid: build=${build}, legacy=${legacy}, upload=${upload}, deploy=${deploy}`);
  requireMatch(/ref:\s*b2683e67f5d04c7aee4cadab6b395c0e58bb3692/,
    'legacy source revision changed');
  requireMatch(/--out\s+dist\/legacy\/pre-column/,
    'legacy artifact output path changed');
  assert.doesNotMatch(text, /\brm\s+(?:-rf|-fr)\s+(?:versions|dist)(?:\s|\/|$)/m,
    '[P0-D02] workflow deletes versions/ or dist/ during deployment');
});
