import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

test('dashboard displays reservations, reports load failures and recovers on retry', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage();
    const card = (label) => page.locator('.admin-stat-card').filter({ hasText: label }).locator('.admin-stat-card__value');
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
      // Pending reviews: exact HEAD count (content-range must be exposed for the browser to read it).
      if (url.pathname.endsWith('/reviews')) return route.fulfill({ json: [], headers: { 'content-range': '*/3', 'access-control-expose-headers': 'content-range' } });
      return route.fulfill({ json: [], headers: { 'content-range': '0-0/0' } });
    });
    await page.goto(`${base}/admin/login`);
    await page.getByPlaceholder('admin@example.com').fill('admin@example.com');
    await page.getByPlaceholder('Password').fill('test-password');
    await page.getByRole('button', { name: 'Entrar al panel' }).click();
    await expect(page.getByRole('alert')).toContainText('Simulated booking query failure');
    await expect(page.getByText('No hay reservas registradas todavía.')).toHaveCount(0);
    // A failed load must not be dressed up as zeros.
    for (const label of ['Reservas totales', 'Pagos pendientes', 'Ingresos', 'Pagos confirmados', 'Reservas por confirmar']) await expect(card(label)).toHaveText('—');
    fail = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByRole('cell', { name: 'PFT-3BD31A7A', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'PFT-60E8EAA3', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    // Fixture: one unpaid WhatsApp booking (pending_payment, $100) and one paid+confirmed PayPal booking ($100, no payments row -> total_snapshot).
    await expect(card('Reservas totales')).toHaveText('2');
    await expect(card('Pagos pendientes')).toHaveText('1');
    await expect(card('Ingresos')).toHaveText('$100');
    await expect(card('Pagos confirmados')).toHaveText('1');
    await expect(card('Reservas por confirmar')).toHaveText('1');
    await expect(card('Comentarios por revisar')).toHaveText('3');
    await page.goto(`${base}/admin/reservations`);
    await expect(page.getByRole('cell', { name: 'PFT-3BD31A7A', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'PFT-60E8EAA3', exact: true })).toBeVisible();
    const pending = page.getByRole('row').filter({ hasText: 'PFT-3BD31A7A' });
    await expect(pending.getByRole('button', { name: /Confirmar/ })).toBeEnabled();
    await expect(pending.getByRole('button', { name: /Editar reserva/ })).toBeEnabled();
    // Ya confirmada (PayPal pagado): no hay acción de confirmar.
    await expect(page.getByRole('row').filter({ hasText: 'PFT-60E8EAA3' }).getByRole('button', { name: /Confirmar/ })).toHaveCount(0);
    assert.equal(new URL(page.url()).pathname, '/admin/reservations');
  } finally {
    await browser.close();
  }
});

test('a failed pending-reviews count shows a dash, raises the alert and recovers through Reintentar', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage();
    const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
    const card = (label) => page.locator('.admin-stat-card').filter({ hasText: label }).locator('.admin-stat-card__value');
    let failReviews = true;
    let reviewRequests = 0;
    const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    await page.route('https://admin-test.supabase.co/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/token')) return route.fulfill({ json: { access_token: 'test-admin-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user } });
      if (url.pathname.endsWith('/profiles')) return route.fulfill({ json: { id: user.id, email: user.email, full_name: 'Test Admin', role: 'admin', active: true } });
      if (url.pathname.endsWith('/user')) return route.fulfill({ json: user });
      if (url.pathname.endsWith('/reviews')) {
        reviewRequests += 1;
        if (failReviews) return route.fulfill({ status: 500, json: { message: 'Simulated reviews count failure', code: 'TEST' }, headers: { 'access-control-expose-headers': 'content-range' } });
        return route.fulfill({ json: [], headers: { 'content-range': '*/4', 'access-control-expose-headers': 'content-range' } });
      }
      if (url.pathname.endsWith('/bookings')) {
        const rows = [{ id: '0', booking_reference: 'PFT-3BD31A7A', tour_date: '2026-09-19', payment_status: 'paid', payment_method_key: 'whatsapp-link', booking_status: 'confirmed', total_snapshot: 250, customers: { full_name: 'Test Customer', whatsapp: '0000000' }, tours: { title: 'Test Tour' } }];
        return route.fulfill({ json: rows });
      }
      return route.fulfill({ json: [], headers: { 'content-range': '0-0/0' } });
    });
    await page.goto(`${base}/admin/login`);
    await page.getByPlaceholder('admin@example.com').fill('admin@example.com');
    await page.getByPlaceholder('Password').fill('test-password');
    await page.getByRole('button', { name: 'Entrar al panel' }).click();

    // Only the reviews count failed: its card is a dash, the booking KPIs still show their real values, and the alert names the Dashboard (not just reservations).
    await expect(card('Comentarios por revisar')).toHaveText('—');
    await expect(page.getByRole('alert')).toContainText('No se pudieron cargar los datos del Dashboard');
    await expect(card('Ingresos')).toHaveText('$250');
    await expect(card('Reservas totales')).toHaveText('1');
    await expect(page.getByRole('cell', { name: 'PFT-3BD31A7A', exact: true })).toBeVisible();
    assert.equal(reviewRequests, 1, 'retry:false - no silent retries');

    failReviews = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(card('Comentarios por revisar')).toHaveText('4');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(card('Ingresos')).toHaveText('$250');
  } finally {
    await browser.close();
  }
});
