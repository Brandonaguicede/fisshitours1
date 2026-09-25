import { defineConfig } from '@playwright/test';
import base from '../package-settings/playwright.config';
export default defineConfig({ ...base, testDir: '.', testMatch: ['catalog.spec.ts', 'i18n.spec.ts'] });
