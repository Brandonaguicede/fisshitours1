import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 45_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium-375', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } }, testIgnore: /backend\.spec\.ts/ },
    { name: 'chromium-768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } }, testIgnore: /backend\.spec\.ts/ },
    { name: 'chromium-1024', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } }, testIgnore: /backend\.spec\.ts/ },
    { name: 'chromium-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /backend\.spec\.ts/ },
    { name: 'backend', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } }, testMatch: /backend\.spec\.ts/ },
  ],
});
