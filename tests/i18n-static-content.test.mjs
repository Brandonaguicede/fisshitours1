// Focused coverage for the CIERRE FUNCIONAL i18n pass: a handful of the 52
// previously English-only, language-blind public texts now actually follow
// the site's language toggle. Not exhaustive — see the session's final
// report for the full list of what was fixed and how each was verified.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';

async function fixture() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
  await page.route('https://admin-test.supabase.co/**', async (route) => {
    return route.fulfill({ json: [], headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
  });
  return { browser, page };
}

test('SEO title and lang attribute follow the language toggle, not just the visible UI', async () => {
  const f = await fixture();
  const { page } = f;
  try {
    await page.goto(`${base}/`);
    // Language defaults to 'en' with no saved preference (LanguageContext).
    await expect(page).toHaveTitle('Papagayo Fishing Tours | Boat Tours in Costa Rica');
    assert.equal(await page.getAttribute('html', 'lang'), 'en');

    // The navbar toggle shows "ES" while the site is in English, but its
    // accessible name is the aria-label ("Switch to Spanish"), not the
    // visible text — the aria-label wins as the button's accessible name.
    await page.getByRole('button', { name: 'Switch to Spanish' }).first().click();
    await expect(page).toHaveTitle('Papagayo Fishing Tours | Tours en Barco en Costa Rica');
    assert.equal(await page.getAttribute('html', 'lang'), 'es');
  } finally {
    await f.browser.close();
  }
});

test('Contact page departure-time labels (Morning/Midday/Afternoon) are no longer English-only', async () => {
  const f = await fixture();
  const { page } = f;
  try {
    await page.addInitScript(() => { localStorage.setItem('language', 'es'); });
    await page.goto(`${base}/contacto`);
    await expect(page.getByText('Mañana', { exact: true })).toBeVisible();
    await expect(page.getByText('Mediodía', { exact: true })).toBeVisible();
    await expect(page.getByText('Tarde', { exact: true })).toBeVisible();
    // The old hardcoded English labels must not leak through in Spanish mode.
    await expect(page.getByText('Morning', { exact: true })).toHaveCount(0);
  } finally {
    await f.browser.close();
  }
});

test('Contact page departure-time labels switch to English when the site language is English', async () => {
  const f = await fixture();
  const { page } = f;
  try {
    await page.goto(`${base}/contacto`);
    await expect(page.getByText('Morning', { exact: true })).toBeVisible();
    await expect(page.getByText('Midday', { exact: true })).toBeVisible();
    await expect(page.getByText('Afternoon', { exact: true })).toBeVisible();
  } finally {
    await f.browser.close();
  }
});
