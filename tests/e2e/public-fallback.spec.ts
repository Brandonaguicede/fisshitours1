import { expect, test, type Page } from '@playwright/test';

const REST_RE = /\/rest\/v1\//;

async function mockSupabaseRest(page: Page, status: number, body: unknown) {
  await page.route(REST_RE, async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function expectHomeFallback(page: Page) {
  await expect(page.getByRole('heading', { name: /Experience the Ocean|Experimenta el/i })).toBeVisible();
  await expect(page.getByText('Second Wind').first()).toBeVisible();
  await expect(page.getByText(/Beach & Snorkeling|Snorkeling & Beach/i).first()).toBeVisible();
  await expect(page.getByText('404 Page not found')).toHaveCount(0);
}

async function expectToursFallback(page: Page) {
  await expect(page.getByRole('heading', { name: /Explore Second Wind|Explora Second Wind/i })).toBeVisible();
  await expect(page.getByText(/Fishing Tour|Fishing/i).first()).toBeVisible();
  await expect(page.getByText('404 Page not found')).toHaveCount(0);
}

test.describe('public content fallbacks', () => {
  test('home keeps local content when Supabase returns empty arrays', async ({ page }) => {
    await mockSupabaseRest(page, 200, []);
    await page.goto('/');

    await expectHomeFallback(page);
  });

  test('home keeps local content when Supabase returns errors', async ({ page }) => {
    await mockSupabaseRest(page, 500, { message: 'mock supabase error' });
    await page.goto('/');

    await expectHomeFallback(page);
  });

  test('home keeps local content when Supabase returns 401', async ({ page }) => {
    await mockSupabaseRest(page, 401, { message: 'unauthorized' });
    await page.goto('/');

    await expectHomeFallback(page);
  });

  test('home shows local content before slow Supabase requests finish', async ({ page }) => {
    await page.route(REST_RE, async () => {
      await new Promise((resolve) => setTimeout(resolve, 30000));
    });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /Experience the Ocean|Experimenta el/i })).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Second Wind').first()).toBeVisible({ timeout: 3000 });
  });

  test('home keeps local content when Supabase is unreachable', async ({ page }) => {
    await page.route(REST_RE, async (route) => route.abort('failed'));
    await page.goto('/');

    await expectHomeFallback(page);
  });

  test('tours page keeps local catalog when Supabase is empty', async ({ page }) => {
    await mockSupabaseRest(page, 200, []);
    await page.goto('/tours');

    await expectToursFallback(page);
  });

  test('tours page keeps local catalog when Supabase errors', async ({ page }) => {
    await mockSupabaseRest(page, 500, { message: 'mock supabase error' });
    await page.goto('/tours');

    await expectToursFallback(page);
  });

  test('tours page keeps local catalog when Supabase returns 401', async ({ page }) => {
    await mockSupabaseRest(page, 401, { message: 'unauthorized' });
    await page.goto('/tours');

    await expectToursFallback(page);
  });

  test('tours page shows local catalog before slow Supabase requests finish', async ({ page }) => {
    await page.route(REST_RE, async () => {
      await new Promise((resolve) => setTimeout(resolve, 30000));
    });
    await page.goto('/tours');

    await expect(page.getByRole('heading', { name: /Explore Second Wind|Explora Second Wind/i })).toBeVisible({ timeout: 3000 });
    await expect(page.getByText(/Fishing Tour|Fishing/i).first()).toBeVisible({ timeout: 3000 });
  });

  test('tours page keeps local catalog when Supabase is unreachable', async ({ page }) => {
    await page.route(REST_RE, async (route) => route.abort('failed'));
    await page.goto('/tours');

    await expectToursFallback(page);
  });
});
