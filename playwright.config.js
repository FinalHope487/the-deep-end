import { defineConfig, devices } from '@playwright/test';

const GPU_ARGS = [
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--use-angle=d3d11',
  '--autoplay-policy=no-user-gesture-required',
];

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: 'core-release.spec.js',

  timeout: 35_000,
  expect: { timeout: 10_000 },

  workers: 1,
  retries: 0,
  reporter: [['list']],

  use: {
    baseURL: 'http://localhost:8090',
    launchOptions: {
      args: GPU_ARGS,
    },
  },

  webServer: {
    command: 'node tools/serve.mjs 8090',
    port: 8090,
    reuseExistingServer: false,
  },

  projects: [
    {
      name: 'resident',
      use: {
        ...devices['Desktop Chrome'],
        viewport: {
          width: 1280,
          height: 800,
        },
      },
    },
  ],
});