// Focused coverage for the CIERRE FUNCIONAL pass: Destinos is fully removed
// (redirects instead of 404ing), Boats/Departure Locations don't expose an
// editable slug, and About content edited in the Admin reaches the public
// homepage. Not a full suite — one behavior per test.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';
import { mockTranslation } from './support/translation-mock.mjs';

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
  const customTitle = 'Pasión local ahora mismo';
  const staleCtaTitle = 'Escríbenos por WhatsApp ahora mismo';
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
    // LanguageContext defaults to 'en' with no saved preference — force 'es'.
    await page.addInitScript(() => { localStorage.setItem('language', 'es'); });
    await page.route('https://admin-test.supabase.co/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (path.endsWith('/site_settings')) {
        return route.fulfill({ json: [{ key: 'about.title.es', value: customTitle, type: 'text', active: true }, { key: 'about.cta_title.es', value: staleCtaTitle, type: 'text', active: true }] });
      }
      if (path.endsWith('/boats')) return route.fulfill({ json: [boatRow] });
      if (path.endsWith('/tour_packages')) return route.fulfill({ json: [tourPackageRow] });
      if (path.endsWith('/time_slots') || path.endsWith('/tour_images') || path.endsWith('/tour_inclusions') || path.endsWith('/reviews') || path.endsWith('/gallery_images')) return route.fulfill({ json: [] });
      return route.fulfill({ json: [], headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
    });
    await page.goto(`${base}/`);
    const acceptDialog = page.getByRole('dialog').getByRole('button', { name: /Aceptar|Accept/i });
    if (await acceptDialog.isVisible().catch(() => false)) await acceptDialog.click();
    await expect(page.getByText(customTitle)).toHaveCount(1, { timeout: 15000 });
    // The contact card under About is fixed copy: an old `about.cta_*` row in the database no longer changes it.
    await expect(page.getByText('¿Quieres hablar con nosotros?')).toHaveCount(1);
    await expect(page.getByText('Escríbenos y con gusto te ayudamos.')).toHaveCount(1);
    await expect(page.getByText(staleCtaTitle)).toHaveCount(0);
  } finally {
    await browser.close();
  }
});

test('Hero and About: the admin edits English only; saving generates the Spanish (EN -> ES) with DeepL, and only for what changed', async () => {
  const f = await loggedInFixture();
  const { page } = f;
  const settingsWrites = [];
  try {
    const translation = await mockTranslation(page);
    await page.route('https://admin-test.supabase.co/rest/v1/site_settings*', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        for (const row of Array.isArray(body) ? body : [body]) settingsWrites.push(row);
        return route.fulfill({ status: 201, json: [] });
      }
      return route.fulfill({ json: [], headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
    });

    await page.goto(`${base}/admin/portada`);
    await page.getByRole('button', { name: 'Textos' }).click();

    // Only the English text is editable: no Spanish field and no language selector.
    await expect(page.getByLabel('Titulo principal', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Titulo principal ES')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'English' })).toHaveCount(0);

    await page.getByLabel('Titulo principal', { exact: true }).fill('New title in English');
    await page.waitForTimeout(300);
    assert.equal(translation.calls.length, 0, 'nothing is translated while typing');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();

    await expect.poll(() => ['home.hero.title.es', 'home.hero.title.en'].every((key) => settingsWrites.some((row) => row.key === key))).toBe(true);
    assert.equal(settingsWrites.find((row) => row.key === 'home.hero.title.en').value, 'New title in English');
    assert.equal(settingsWrites.find((row) => row.key === 'home.hero.title.es').value, 'New title in English [ES]');
    assert.deepEqual(translation.calls.map((call) => call.texts), [['New title in English']]);
    // Untouched texts (subtitle, eyebrow...) keep their Spanish: no other .es key is written.
    assert.deepEqual(settingsWrites.filter((row) => row.key.endsWith('.es')).map((row) => row.key), ['home.hero.title.es']);

    // About: same rule.
    settingsWrites.length = 0;
    await page.getByRole('link', { name: 'Sobre Nosotros' }).click();
    await page.getByLabel('Titulo', { exact: true }).fill('About Title EN');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect.poll(() => ['about.title.es', 'about.title.en'].every((key) => settingsWrites.some((row) => row.key === key))).toBe(true);
    assert.equal(settingsWrites.find((row) => row.key === 'about.title.en').value, 'About Title EN');
    assert.equal(settingsWrites.find((row) => row.key === 'about.title.es').value, 'About Title EN [ES]');
    assert.deepEqual(translation.calls.map((call) => call.texts), [['New title in English'], ['About Title EN']]);
  } finally {
    await f.browser.close();
  }
});
