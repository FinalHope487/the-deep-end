// Check IDs: P0-S01, P0-S02, P0-S03, P0-G01, P0-B06, P0-B09, P0-L01, P0-SV01, P0-V01
import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const resultsDir = mkdtempSync(join(tmpdir(), 'deepend-p0-playwright-'));
process.once('exit', () => rmSync(resultsDir, { recursive: true, force: true }));

const GPU_ARGS = [
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--use-angle=d3d11',
  '--autoplay-policy=no-user-gesture-required',
];

export default defineConfig({
  testDir: '.',
  testMatch: 'p0-*.spec.js',
  timeout: 40_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  fullyParallel: false,
  reporter: [['list']],
  outputDir: resultsDir,
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: GPU_ARGS },
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'p0' }],
});
