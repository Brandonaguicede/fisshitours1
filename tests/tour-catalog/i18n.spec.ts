import { test, expect, type Page } from '@playwright/test';

// ADMIN -> LANDING, rendered by the real components (tour cards, tour modal, booking panel).
// Data is shaped exactly like the Admin saves it: the English the admin wrote (`*_en` / legacy) and the Spanish that
// DeepL generated (`*_es`). English visitors must read the original, Spanish visitors the translation, proper
// names (boat, departure place) are never translated, and older rows keep their fallbacks.
// All REST/Edge calls are intercepted (nothing reaches the real project, nothing is written).

const tour = {
  id: 'sunset', category: 'Snorkeling & Beach', image_url: '/images/papagayo-logo.png', active: true, sort_order: 1,
  title: 'Sunset Cruise', title_en: 'Sunset Cruise', title_es: 'Crucero al atardecer',
  description: 'Private cruise at sunset.', description_en: 'Private cruise at sunset.', description_es: 'Crucero privado al atardecer.',
  highlights: ['Sport fishing'], highlights_en: ['Sport fishing'], highlights_es: ['Pesca deportiva'],
  included: ['Drinks'], included_en: ['Drinks'], included_es: ['Bebidas'],
};
const boat = { id: 'a', slug: 'a', name: 'Second Wind', max_guests: 10, image_url: '/images/papagayo-logo.png', active: true, length: '32 feet', engine: 'Yamaha', featured_spec: '', badge: 'Luxury meets nature', badge_en: 'Luxury meets nature', badge_es: 'Lujo y naturaleza' };
const pkg = {
  id: 'a-half', boat_tour_id: 'a-sunset', name: 'Sunset Special', name_en: 'Sunset Special', name_es: 'Especial de atardecer',
  description: 'Private sunset cruise with drinks.', description_en: 'Private sunset cruise with drinks.', description_es: 'Paseo privado al atardecer con bebidas.',
  base_price: 650, active: true, custom_quote: false, included_guests: 5, max_guests: 10, extra_guest_price: 65, duration_minutes: 240,
  departure_times: ['08:00'], package_included: ['Fishing equipment included'], package_included_en: ['Fishing equipment included'], package_included_es: ['Equipo de pesca incluido'],
  meal_options: [{ en: 'Fish casado', es: 'Casado con pescado' }],
  boat_tours: { id: 'a-sunset', boat_id: 'a', tour_id: 'sunset', active: true, boats: { active: true, max_guests: 10 }, tours: tour },
};
const departureLocations = [
  { id: 'coco', name: 'Playas del Coco', slug: 'coco', description: 'Main local exit.', description_en: 'Main local exit.', description_es: 'Salida local principal.', surcharge_amount: 0, currency: 'USD', active: true, is_default: true, sort_order: 1 },
  // older row: only the legacy description exists (no _en/_es yet)
  { id: 'tamarindo', name: 'Tamarindo', slug: 'tamarindo', description: 'Legacy pickup text.', description_en: null, description_es: null, surcharge_amount: 25, currency: 'USD', active: true, is_default: false, sort_order: 2 },
];
const paymentMethods = [{ key: 'pay-on-day', name: 'Pay on the day', type: 'pay_on_day', description: 'Pay on the day of the tour.', description_en: 'Pay on the day of the tour.', description_es: 'Paga el día del tour.', active: true, sort_order: 1 }];

async function mock(page: Page, language: 'en' | 'es') {
  await page.addInitScript((value) => localStorage.setItem('language', value), language);
  await page.route(/\/rest\/v1\//, async (route) => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1);
    let data: unknown = [];
    if (table === 'boats') data = [boat];
    if (table === 'tour_packages') data = [pkg];
    if (table === 'time_slots') data = [{ id: 'am', label: 'Morning', starts_at: '08:00:00', active: true }];
    if (table === 'departure_locations') data = departureLocations;
    if (table === 'payment_methods') data = paymentMethods;
    await route.fulfill({ json: data });
  });
  await page.route(/\/functions\/v1\//, async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    if (name === 'get-booking-availability') return route.fulfill({ json: { slots: [{ id: 'am', label: 'Morning', time: '08:00', available: true }] } });
    if (name === 'calculate-booking-price') return route.fulfill({ json: { base_price: 650, total: 650, included_guests: 5, max_guests: 10, extra_guest_price: 65, extras: [], currency: 'USD' } });
    await route.fulfill({ json: {} });
  });
  await page.goto('/tests/tour-catalog/fixture.html');
}

const expected = {
  en: { view: 'View tour Sunset Cruise', title: 'Sunset Cruise', pkg: 'Sunset Special', description: 'Private sunset cruise with drinks.', included: 'Fishing equipment included', activity: 'Sport fishing', meal: 'Fish casado', coco: 'Main local exit.', tamarindo: 'Legacy pickup text.', proceed: /^Continue$/, reserve: 'Reserve' },
  es: { view: 'Ver tour Crucero al atardecer', title: 'Crucero al atardecer', pkg: 'Especial de atardecer', description: 'Paseo privado al atardecer con bebidas.', included: 'Equipo de pesca incluido', activity: 'Pesca deportiva', meal: 'Casado con pescado', coco: 'Salida local principal.', tamarindo: 'Legacy pickup text.', proceed: /^Continuar$/, reserve: 'Reservar' },
} as const;

for (const language of ['en', 'es'] as const) {
  test(`LANDING ${language.toUpperCase()}: tour card + modal show the ${language === 'en' ? 'English the admin wrote' : 'DeepL Spanish'} (title, package, description, incluye, activities, meals)`, async ({ page }) => {
    const t = expected[language];
    await mock(page, language);
    await expect(page.getByRole('button', { name: t.view, exact: true })).toBeVisible();
    // the other language must not leak into the card
    const other = expected[language === 'en' ? 'es' : 'en'];
    await expect(page.getByRole('button', { name: other.view, exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: t.view, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(t.pkg, { exact: true }).first()).toBeVisible();
    await dialog.getByRole('button', { name: new RegExp(t.pkg) }).click();
    await expect(dialog.getByText(t.included, { exact: true })).toBeVisible();
    await expect(dialog.getByText(t.activity)).toBeVisible();
    await expect(dialog.getByText(t.meal, { exact: true })).toBeVisible();
    await expect(dialog.getByText(other.included, { exact: true })).toHaveCount(0);
    await expect(dialog.getByText(other.meal, { exact: true })).toHaveCount(0);
  });

  test(`LANDING ${language.toUpperCase()}: departure location step shows the ${language === 'en' ? 'English' : 'Spanish'} description, the place name untranslated, and the legacy fallback`, async ({ page }) => {
    const t = expected[language];
    await mock(page, language);
    await page.getByRole('button', { name: t.view, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: new RegExp(t.pkg) }).click();
    await dialog.getByRole('button', { name: t.reserve, exact: true }).click();
    await page.getByRole('button', { name: t.proceed }).click();
    await page.locator('input[name="mealOption"]').first().check({ force: true });
    await page.getByRole('button', { name: t.proceed }).click();
    // Departure location step (scoped to its own fieldset: the booking summary repeats the place name)
    const step = page.locator('fieldset').filter({ has: page.locator('input[name="departureLocation"]') });
    await expect(step.locator('input[name="departureLocation"]')).toHaveCount(2);
    await expect(step.getByText('Playas del Coco', { exact: true })).toBeVisible();
    await expect(step.getByText('Tamarindo', { exact: true })).toBeVisible();
    await expect(step.getByText(t.coco, { exact: true })).toBeVisible();
    await expect(step.getByText(expected[language === 'en' ? 'es' : 'en'].coco, { exact: true })).toHaveCount(0);
    // A row with only the legacy description still shows it in both languages (older records keep working).
    await expect(step.getByText(t.tamarindo, { exact: true })).toBeVisible();
  });
}
