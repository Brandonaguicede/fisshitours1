import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import config from '../package-settings/playwright.config';
export default defineConfig({ ...config, testDir: '.', testMatch: 'hero.spec.ts', use: { baseURL: 'http://127.0.0.1:5174' },
  webServer: { command: 'node tests/hero/server.mjs', cwd: fileURLToPath(new URL('../..', import.meta.url)), url: 'http://127.0.0.1:5174', reuseExistingServer: false },
  projects: [
  ...config.projects ?? [],
  { name: 'webkit-mobile', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
] });
