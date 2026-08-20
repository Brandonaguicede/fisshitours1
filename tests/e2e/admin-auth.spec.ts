import { expect, test, type Page } from '@playwright/test';

const AUTH_TOKEN_RE = /\/auth\/v1\/token\?grant_type=password/;
const AUTH_USER_RE = /\/auth\/v1\/user/;
const AUTH_LOGOUT_RE = /\/auth\/v1\/logout/;
const PROFILES_RE = /\/rest\/v1\/profiles/;

function user(role = 'admin', active = true) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: `${role}@example.com`,
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
}

function tokenBody(role = 'admin') {
  return {
    access_token: `test-${role}-token`,
    refresh_token: `test-${role}-refresh`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: user(role),
  };
}

async function mockAuthorizedAdmin(page: Page, role = 'admin', active = true) {
  await page.route(AUTH_TOKEN_RE, async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tokenBody(role)) }));
  await page.route(AUTH_USER_RE, async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: user(role) }) }));
  await page.route(AUTH_LOGOUT_RE, async (route) => route.fulfill({ status: 204, body: '' }));
  await page.route(PROFILES_RE, async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: user(role).id, email: user(role).email, full_name: 'Admin Tester', role, active }),
  }));
}

test.describe('admin auth routing', () => {
  test('admin login renders the form and not the 404 page', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page.getByRole('heading', { name: 'Admin Fishing Tours' })).toBeVisible();
    await expect(page.getByPlaceholder('admin@example.com')).toBeVisible();
    await expect(page.getByText('404 Page not found')).toHaveCount(0);
  });

  test('/admin without session redirects to login', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole('heading', { name: 'Admin Fishing Tours' })).toBeVisible();
  });

  test('invalid login shows a safe error', async ({ page }) => {
    await page.route(AUTH_TOKEN_RE, async (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant' }) }));
    await page.goto('/admin/login');
    await page.getByPlaceholder('admin@example.com').fill('bad@example.com');
    await page.getByPlaceholder('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Entrar al panel' }).click();
    await expect(page.getByRole('alert')).toContainText('Credenciales incorrectas');
  });

  test('authorized user enters the dashboard', async ({ page }) => {
    await mockAuthorizedAdmin(page, 'editor', true);
    await page.goto('/admin/login');
    await page.getByPlaceholder('admin@example.com').fill('editor@example.com');
    await page.getByPlaceholder('Password').fill('test-password');
    await page.getByRole('button', { name: 'Entrar al panel' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('user without allowed profile is blocked', async ({ page }) => {
    await mockAuthorizedAdmin(page, 'guest', true);
    await page.goto('/admin/login');
    await page.getByPlaceholder('admin@example.com').fill('guest@example.com');
    await page.getByPlaceholder('Password').fill('test-password');
    await page.getByRole('button', { name: 'Entrar al panel' }).click();
    await expect(page.getByRole('alert')).toContainText('no tiene acceso activo');
  });

  test('reloading an internal admin route does not show React 404', async ({ page }) => {
    await mockAuthorizedAdmin(page, 'viewer', true);
    await page.goto('/admin/login');
    await page.getByPlaceholder('admin@example.com').fill('viewer@example.com');
    await page.getByPlaceholder('Password').fill('test-password');
    await page.getByRole('button', { name: 'Entrar al panel' }).click();
    await page.goto('/admin/boats');
    await expect(page).toHaveURL(/\/admin\/boats$/);
    await expect(page.locator('.admin-main')).toContainText('Botes');
    await expect(page.getByText('404 Page not found')).toHaveCount(0);
  });
});
