// Focused coverage for the CIERRE FUNCIONAL pass: Destinos is fully removed
// (redirects instead of 404ing), Boats/Departure Locations don't expose an
// editable slug, and About content edited in the Admin reaches the public
// homepage. Not a full suite — one behavior per test.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };

async function loggedInFixture() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const writes = [];
  const boats = [{ id: 'boat-1', name: 'Second Wind', max_guests: 8, active: true, sort_order: 1, engine: 'Yamaha 250', length: '32ft', boat_images: [] }];
  const departureLocations = [{ id: 'loc-1', name: 'Playas del Coco', slug: 'playas-del-coco', description: '', surcharge_amount: 0, currency: 'USD', active: true, sort_order: 1, is_default: true }];

  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith('/token')) return route.fulfill({ json: { access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600, user } });
    if (path.endsWith('/profiles')) return route.fulfill({ json: { ...user, full_name: 'Test Admin', role: 'admin', active: true } });
    if (path.endsWith('/user')) return route.fulfill({ json: user });
    if (path.endsWith('/boats')) return route.fulfill({ json: boats });
    if (path.endsWith('/departure_locations')) return route.fulfill({ json: departureLocations });
    return route.fulfill({ json: [], headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
  });

  await page.goto(`${base}/admin/login`);
  await page.getByPlaceholder('admin@example.com').fill(user.email);
  await page.getByPlaceholder('Password').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page.getByText('Reservas totales')).toBeVisible();
  return { browser, page, writes };
}

test('the Destinos feature was removed: no sidebar entry, and the old route redirects instead of 404ing', async () => {
  const f = await loggedInFixture();
  const { page } = f;
  try {
    await expect(page.getByRole('link', { name: 'Destinos' })).toHaveCount(0);
    await page.goto(`${base}/admin/destinations`);
    await expect(page).toHaveURL(`${base}/admin`);
  } finally {
    await f.browser.close();
  }
});

test('boat editor has no editable Slug field', async () => {
  const f = await loggedInFixture();
  const { page } = f;
  try {
    await page.goto(`${base}/admin/boats`);
    await page.getByRole('button', { name: /Editar bote/ }).click();
    await expect(page.getByText('Slug', { exact: true })).toHaveCount(0);
  } finally {
    await f.browser.close();
  }
});

test('boat editor has no visible/editable internal ID field', async () => {
  const f = await loggedInFixture();
  const { page } = f;
  try {
    await page.goto(`${base}/admin/boats`);
    await page.getByRole('button', { name: /Editar bote/ }).click();
    await expect(page.getByText('ID interno')).toHaveCount(0);
    await expect(page.locator('#boat-id')).toHaveCount(0);
  } finally {
    await f.browser.close();
  }
});

test('departure location editor has no editable Slug field', async () => {
  const f = await loggedInFixture();
  const { page } = f;
  try {
    await page.goto(`${base}/admin/departure-locations`);
    await page.getByRole('button', { name: /Editar lugar de salida/ }).click();
    await expect(page.getByText('Slug', { exact: true })).toHaveCount(0);
  } finally {
    await f.browser.close();
  }
});

test('tour editor no longer has an Ubicaciones field', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const tours = [{
    id: 'tour-1', title: 'Half Day Fishing', slug: 'half-day-fishing', description: 'Aventura de pesca', long_description: '',
    category: 'inshore', publication_status: 'published', active: true, featured: false, sort_order: 1, location: null,
    highlights: [], included: [], rating: 5, image_url: null, image_alt: null, image_public_id: null, operating_end_time: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }];
  try {
    await page.route('https://admin-test.supabase.co/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith('/token')) return route.fulfill({ json: { access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600, user } });
      if (path.endsWith('/profiles')) return route.fulfill({ json: { ...user, full_name: 'Test Admin', role: 'admin', active: true } });
      if (path.endsWith('/user')) return route.fulfill({ json: user });
      if (path.endsWith('/tours')) return route.fulfill({ json: tours });
      return route.fulfill({ json: [], headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
    });
    await page.goto(`${base}/admin/login`);
    await page.getByPlaceholder('admin@example.com').fill(user.email);
    await page.getByPlaceholder('Password').fill('test-password');
    await page.getByRole('button', { name: 'Entrar al panel' }).click();
    await expect(page.getByText('Reservas totales')).toBeVisible();

    await page.goto(`${base}/admin/tours`);
    await expect(page.getByText('Ubicaciones', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /Editar tour/ }).click();
    await expect(page.getByText('Ubicaciones', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Agregar', exact: true })).toHaveCount(0);
  } finally {
    await browser.close();
  }
});

test('About content edited in the Admin reaches the public homepage', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1200 } });
  const customCtaTitle = 'Escríbenos por WhatsApp ahora mismo';
  // HomePage renders nothing at all (`if (!selectedBoat) return null`) until
  // the boat/tour catalog resolves at least one boat — same minimal rows
  // booking-payment-method-key.test.mjs uses to get past that gate, shaped
  // to match mapBoat/mapBoatTour exactly.
  const boatRow = { id: 'boat-1', slug: 'second-wind', name: 'Second Wind', image_url: null, images: null, badge: null, length: '32ft', engine: 'Yamaha 250', max_guests: 10, featured_spec: null, active: true, sort_order: 1 };
  const tourPackageRow = {
    id: 'pkg-1', active: true, name: 'Half Day', package_type: 'half-day', departure_times: null, meal_options: null,
    description: 'Half day fishing', package_included: null, duration_minutes: 240, sort_order: 1,
    base_price: 650, included_guests: 4, max_guests: 10, extra_guest_price: 50, custom_quote: false,
    boat_tours: {
      id: 'link-1', boat_id: 'boat-1', tour_id: 'tour-1', active: true,
      boats: { active: true, max_guests: 10 },
      tours: { id: 'tour-1', title: 'Fishing Tour', category: 'Fishing', description: 'Half day fishing trip', image_url: null, included: null, highlights: null, active: true },
    },
  };
  try {
    // LanguageContext defaults to 'en' with no saved preference — force 'es'
    // so this exercises the same `about.cta_title.es` key the Admin edits.
    await page.addInitScript(() => { localStorage.setItem('language', 'es'); });
    await page.route('https://admin-test.supabase.co/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (path.endsWith('/site_settings')) {
        return route.fulfill({ json: [{ key: 'about.cta_title.es', value: customCtaTitle, type: 'text', active: true }] });
      }
      if (path.endsWith('/boats')) return route.fulfill({ json: [boatRow] });
      if (path.endsWith('/tour_packages')) return route.fulfill({ json: [tourPackageRow] });
      if (path.endsWith('/time_slots') || path.endsWith('/tour_images') || path.endsWith('/tour_inclusions') || path.endsWith('/reviews') || path.endsWith('/gallery_images')) return route.fulfill({ json: [] });
      return route.fulfill({ json: [], headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
    });
    await page.goto(`${base}/`);
    const acceptDialog = page.getByRole('dialog').getByRole('button', { name: /Aceptar|Accept/i });
    if (await acceptDialog.isVisible().catch(() => false)) await acceptDialog.click();
    await expect(page.getByText(customCtaTitle)).toHaveCount(1, { timeout: 15000 });
  } finally {
    await browser.close();
  }
});

test('Hero Section only exposes Spanish text fields, and Guardar sends them to translate-content', async () => {
  const f = await loggedInFixture();
  const { page } = f;
  const translateCalls = [];
  try {
    await page.route('https://admin-test.supabase.co/functions/v1/translate-content', async (route) => {
      const body = route.request().postDataJSON();
      translateCalls.push(body);
      route.fulfill({ json: { fields: body.fields.map((field) => ({ key: field.key, es: field.value, en: `[EN] ${field.value}` })) } });
    });

    await page.goto(`${base}/admin/content`);
    await page.getByRole('button', { name: 'Textos' }).click();

    // No manual English fields and no ES/EN language selector anywhere.
    await expect(page.getByText('Titulo principal EN')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'English' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Todos' })).toHaveCount(0);

    const titleField = page.locator('label', { hasText: 'Titulo principal' }).locator('input');
    await titleField.fill('Nuevo titulo en español');
    await page.getByRole('button', { name: 'Guardar hero' }).click();

    await expect.poll(() => translateCalls.length).toBeGreaterThan(0);
    const sentField = translateCalls[0].fields.find((field) => field.key === 'home.hero.title');
    assert.ok(sentField, 'expected home.hero.title to be sent for translation');
    assert.equal(sentField.value, 'Nuevo titulo en español');
  } finally {
    await f.browser.close();
  }
});
