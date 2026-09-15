import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

test('dashboard displays reservations, reports load failures and recovers on retry', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage();
    let fail = true;
    const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    await page.route('https://admin-test.supabase.co/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/token')) return route.fulfill({ json: { access_token: 'test-admin-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user } });
      if (url.pathname.endsWith('/profiles')) return route.fulfill({ json: { id: user.id, email: user.email, full_name: 'Test Admin', role: 'admin', active: true } });
      if (url.pathname.endsWith('/user')) return route.fulfill({ json: user });
      if (url.pathname.endsWith('/bookings')) {
        if (fail) return route.fulfill({ status: 500, json: { message: 'Simulated booking query failure', code: 'TEST' } });
        return route.fulfill({ json: ['PFT-3BD31A7A', 'PFT-60E8EAA3'].map((reference, i) => ({ id: String(i), booking_reference: reference, tour_date: '2026-09-19', payment_status: i ? 'paid' : 'pending', booking_status: i ? 'confirmed' : 'pending_payment', total_snapshot: 100, customers: { full_name: 'Test Customer', whatsapp: '0000000' }, tours: { title: 'Test Tour' } })) });
      }
      return route.fulfill({ json: [], headers: { 'content-range': '0-0/0' } });
    });
    await page.goto(process.env.ADMIN_TEST_BASE_URL ?? 'http://127.0.0.1:5174/admin/login');
    await page.getByPlaceholder('admin@example.com').fill('admin@example.com');
    await page.getByPlaceholder('Password').fill('test-password');
    await page.getByRole('button', { name: 'Entrar al panel' }).click();
    await expect(page.getByRole('alert')).toContainText('Simulated booking query failure');
    await expect(page.getByText('No hay reservas registradas todavía.')).toHaveCount(0);
    fail = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByRole('cell', { name: 'PFT-3BD31A7A', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'PFT-60E8EAA3', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    assert.equal(new URL(page.url()).pathname, '/admin');
  } finally {
    await browser.close();
  }
});
