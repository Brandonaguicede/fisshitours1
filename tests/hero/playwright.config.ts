import { defineConfig } from '@playwright/test';
import config from '../package-settings/playwright.config';
export default defineConfig({ ...config, testDir: '.', testMatch: 'hero.spec.ts' });
