import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/http-server/bin/http-server tests/e2e/pages --host 127.0.0.1 --port 4173 --silent',
    url: 'http://127.0.0.1:4173/single-image.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
