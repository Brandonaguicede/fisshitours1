import { expect, test, type Page } from '@playwright/test';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated', role: 'authenticated', email: 'recovery@example.com',
  app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
};
const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.signature`;
const callback = `/update-password#access_token=${token}&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=recovery`;

async function mockAuth(page: Page) {
  await page.route('**/auth/v1/user', (route) => route.fulfill({ json: user }));
  await page.route('**/auth/v1/logout*', (route) => route.fulfill({ status: 204 }));
}

test('missing, expired and ordinary sign-in links cannot update passwords', async ({ page }) => {
  await mockAuth(page);
  for (const url of ['/update-password', '/update-password#error=access_denied&error_code=otp_expired', callback.replace('type=recovery', 'type=signup')]) {
    await page.goto(url);
    await expect(page.getByRole('alert')).toContainText('invalid or has expired');
    await expect(page.getByRole('button', { name: 'Update Password', exact: true })).toBeDisabled();
  }
});

test('recovery survives reload, validates input, updates Auth and clears session', async ({ page }) => {
  await mockAuth(page);
  await page.goto(callback);
  const submit = page.getByRole('button', { name: 'Update Password', exact: true });
  await expect(submit).toBeEnabled();
  await expect(page).toHaveURL(/\/update-password#?$/);
  await page.reload();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole('alert')).toHaveText('Both password fields are required.');
  await page.getByLabel('New Password', { exact: true }).fill('short');
  await page.getByLabel('Confirm New Password').fill('short');
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('at least 6');
  await page.getByLabel('New Password', { exact: true }).fill('new-password');
  await submit.click();
  await expect(page.getByRole('alert')).toHaveText('Passwords do not match.');
  await page.getByLabel('Confirm New Password').fill('new-password');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/auth/v1/user', async (route) => {
    if (route.request().method() === 'PUT') {
      expect(route.request().postDataJSON()).toMatchObject({ password: 'new-password' });
      await pending;
    }
    await route.fulfill({ json: user });
  });
  await submit.click();
  await expect(page.getByRole('button', { name: 'Updating password...' })).toBeDisabled();
  release();
  await expect(page.getByRole('status')).toContainText('Password updated successfully');
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect(await page.evaluate(() => sessionStorage.getItem('papagayo-password-recovery'))).toBeNull();
  await page.goto('/update-password');
  await expect(submit).toBeDisabled();
});

test('server policy and sign-out failures remain actionable', async ({ page }) => {
  await mockAuth(page);
  await page.goto(callback);
  const submit = page.getByRole('button', { name: 'Update Password', exact: true });
  await expect(submit).toBeEnabled();
  await page.getByLabel('New Password', { exact: true }).fill('new-password');
  await page.getByLabel('Confirm New Password').fill('new-password');
  await page.route('**/auth/v1/user', (route) => route.request().method() === 'PUT'
    ? route.fulfill({ status: 422, json: { code: 'weak_password', msg: 'Password must contain a symbol.' } })
    : route.fulfill({ json: user }));
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('Password must contain a symbol.');
  await expect(submit).toBeEnabled();
  await page.route('**/auth/v1/user', (route) => route.fulfill({ json: user }));
  await page.route('**/auth/v1/logout*', (route) => route.fulfill({ status: 500, json: { message: 'Unavailable' } }));
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('sign out failed');
  await page.route('**/auth/v1/logout*', (route) => route.fulfill({ status: 204 }));
  await page.getByRole('button', { name: 'Retry sign out' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
});
