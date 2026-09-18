import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

test('dashboard displays reservations, reports load failures and recovers on retry', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage();
    const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
    let fail = true;
    const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    await page.route('https://admin-test.supabase.co/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/token')) return route.fulfill({ json: { access_token: 'test-admin-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user } });
      if (url.pathname.endsWith('/profiles')) return route.fulfill({ json: { id: user.id, email: user.email, full_name: 'Test Admin', role: 'admin', active: true } });
      if (url.pathname.endsWith('/user')) return route.fulfill({ json: user });
      if (url.pathname.endsWith('/bookings') || url.pathname.endsWith('/rpc/list_admin_bookings')) {
        if (fail) return route.fulfill({ status: 500, json: { message: 'Simulated booking query failure', code: 'TEST' } });
        const rows = ['PFT-3BD31A7A', 'PFT-60E8EAA3'].map((reference, i) => ({ id: String(i), booking_reference: reference, tour_date: '2026-09-19', payment_status: i ? 'paid' : 'pending', payment_method_key: i ? 'paypal' : 'whatsapp-link', booking_status: i ? 'confirmed' : 'pending_payment', total_snapshot: 100, customers: { full_name: 'Test Customer', whatsapp: '0000000' }, tours: { title: 'Test Tour' } }));
        return route.fulfill({ json: url.pathname.endsWith('/rpc/list_admin_bookings') ? { rows, total: rows.length } : rows });
      }
      return route.fulfill({ json: [], headers: { 'content-range': '0-0/0' } });
    });
    await page.goto(`${base}/admin/login`);
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
    await expect(page.locator('.admin-stat-card').filter({ hasText: 'Reservas por confirmar' }).locator('.admin-stat-card__value')).toHaveText('1');
    await page.goto(`${base}/admin/reservations`);
    await expect(page.getByRole('cell', { name: 'PFT-3BD31A7A', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'PFT-60E8EAA3', exact: true })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'PFT-3BD31A7A' }).getByRole('button', { name: /Confirmar reserva/ })).toBeEnabled();
    assert.equal(new URL(page.url()).pathname, '/admin/reservations');
  } finally {
    await browser.close();
  }
});
