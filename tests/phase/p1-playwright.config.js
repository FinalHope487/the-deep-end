// Check IDs: P1-A09 (phase-local Chromium tests; P0 test selection is unchanged).
// Official command: playwright test -c tests/phase/p1-playwright.config.js --timeout=120000.
import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const outputDir = mkdtempSync(join(tmpdir(), 'p1-playwright-'));
process.once('exit', () => rmSync(outputDir, { recursive: true, force: true }));

export default defineConfig({
  testDir: '.',
  testMatch: 'p1-*.spec.js',
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  retries: 0,
  fullyParallel: false,
  reporter: [['list']],
  outputDir,
  use: { ...devices['Desktop Chrome'], trace: 'off', screenshot: 'off', video: 'off' },
  projects: [{ name: 'p1-chromium' }],
});
