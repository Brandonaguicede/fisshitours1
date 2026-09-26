// Focused coverage for the CIERRE DE SEGURIDAD pass: payment methods lost
// their CRUD (create/edit/delete) and can only toggle `active`, and Hero
// Section no longer exposes CTA button configuration. Not a full suite —
// each test checks one deliberate behavior change.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };

async function loggedInFixture() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const writes = [];
  const paymentMethods = [
    { id: '1', key: 'paypal', name: 'PayPal', description: 'Pago con tarjeta via PayPal', type: 'paypal', active: true, instructions: null, logo_url: null, sort_order: 1, created_at: '', updated_at: '' },
    { id: '2', key: 'whatsapp-link', name: 'WhatsApp', description: 'Enlace de pago por WhatsApp', type: 'whatsapp_link', active: true, instructions: null, logo_url: null, sort_order: 2, created_at: '', updated_at: '' },
  ];

  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (path.endsWith('/token')) return route.fulfill({ json: { access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600, user } });
    if (path.endsWith('/profiles')) return route.fulfill({ json: { ...user, full_name: 'Test Admin', role: 'admin', active: true } });
    if (path.endsWith('/user')) return route.fulfill({ json: user });
    if (path.endsWith('/payment_methods')) {
      if (method === 'PATCH') {
        writes.push({ table: 'payment_methods', method, body: request.postDataJSON(), query: url.searchParams.get('key') });
        return route.fulfill({ json: [] });
      }
      if (method === 'POST' || method === 'DELETE') {
        writes.push({ table: 'payment_methods', method, body: method === 'POST' ? request.postDataJSON() : null });
        return route.fulfill({ json: [] });
      }
      return route.fulfill({ json: paymentMethods });
    }
    if (path.endsWith('/site_settings')) return route.fulfill({ json: [] });
    return route.fulfill({ json: [], headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
  });

  await page.goto(`${base}/admin/login`);
  await page.getByPlaceholder('admin@example.com').fill(user.email);
  await page.getByPlaceholder('Password').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page.getByText('Reservas totales')).toBeVisible();
  return { browser, page, writes };
}

test('payment methods screen has no create/edit/delete controls, only an active/inactive toggle', async () => {
  const f = await loggedInFixture();
  const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/payment-methods`);
    await expect(page.getByRole('cell', { name: 'PayPal', exact: true })).toBeVisible();

    // No path back into the old CRUD form.
    await expect(page.getByRole('button', { name: /Crear m.todo/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Editar m.todo/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Eliminar m.todo/i })).toHaveCount(0);
    await expect(page.locator('input[value="paypal"]')).toHaveCount(0); // no exposed `key` input

    // The only mutation this screen may ever fire is `active`.
    await page.getByRole('button', { name: /Desactivar PayPal/i }).click();
    await expect.poll(() => writes.filter((w) => w.table === 'payment_methods').length).toBeGreaterThan(0);
    const write = writes.find((w) => w.table === 'payment_methods');
    assert.equal(write.method, 'PATCH');
    assert.deepEqual(Object.keys(write.body), ['active']);
    assert.equal(write.body.active, false);
  } finally {
    await f.browser.close();
  }
});

test('hero section does not expose CTA button configuration', async () => {
  const f = await loggedInFixture();
  const { page } = f;
  try {
    await page.goto(`${base}/admin/portada`);
    await page.getByRole('button', { name: 'Textos' }).click();
    for (const label of [/Boton principal/i, /Enlace boton principal/i, /Activar boton principal/i, /Boton secundario/i, /Enlace boton secundario/i, /Activar boton secundario/i]) {
      await expect(page.getByText(label)).toHaveCount(0);
    }
  } finally {
    await f.browser.close();
  }
});

test('the admin header no longer has a bell/notifications control', async () => {
  const f = await loggedInFixture();
  const { page } = f;
  try {
    await expect(page.getByRole('button', { name: /Notificaciones/i })).toHaveCount(0);
  } finally {
    await f.browser.close();
  }
});
