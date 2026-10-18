import { defineConfig, devices } from '@playwright/test';

const GPU_ARGS = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 2,
  reporter: [['list']],
  globalSetup: './tests/e2e/global-setup.js',
  use: {
    baseURL: 'http://localhost:8090',
    launchOptions: { args: GPU_ARGS },
  },
  webServer: {
    command: 'node tools/serve.mjs 8090',
    port: 8090,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', testIgnore: /perf(-igpu)?\.spec/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    // frame-pacing test needs the whole machine: runs alone after everything else
    { name: 'perf', testMatch: /perf\.spec/, dependencies: ['desktop'], use: { ...devices['Desktop Chrome'] } },
    // A11b: the same on the integrated GPU, after A11 (run alone: --project=perf-igpu --no-deps)
    { name: 'perf-igpu', testMatch: /perf-igpu\.spec/, dependencies: ['perf'], use: { ...devices['Desktop Chrome'], launchOptions: { args: [...GPU_ARGS, '--force_low_power_gpu'] } } },
  ],
});
