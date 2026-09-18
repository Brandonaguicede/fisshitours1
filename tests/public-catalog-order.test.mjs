// CIERRE FUNCIONAL: Admin's Boats reorder writes boats.sort_order, and
// getActiveBoats() already queries `.order('sort_order')` with no downstream
// re-sort — this guards that against a future regression (e.g. someone
// adding a `.sort()` by name/price in FleetSection or useBookingCatalog).
// Boat names/prices are chosen so an accidental alphabetical or price sort
// would visibly reorder them, unlike sort_order itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';

test('public homepage lists boats in boats.sort_order, not name or price', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1200 } });
  // Pre-sorted by sort_order ascending, as getActiveBoats()'s `.order('sort_order')`
  // would return from a real Supabase query — Zulu (1) before Alpha (2), even
  // though it's alphabetically last and has the higher price.
  const boats = [
    { id: 'boat-1', slug: 'zulu-boat', name: 'Zulu Boat', image_url: null, images: null, badge: null, length: '32ft', engine: 'Yamaha 250', max_guests: 10, featured_spec: null, active: true, sort_order: 1 },
    { id: 'boat-2', slug: 'alpha-boat', name: 'Alpha Boat', image_url: null, images: null, badge: null, length: '28ft', engine: 'Yamaha 150', max_guests: 8, featured_spec: null, active: true, sort_order: 2 },
  ];
  const tourPackages = [
    {
      id: 'pkg-1', active: true, name: 'Half Day', package_type: 'half-day', departure_times: null, meal_options: null,
      description: 'Half day fishing', package_included: null, duration_minutes: 240, sort_order: 1,
      base_price: 900, included_guests: 4, max_guests: 10, extra_guest_price: 50, custom_quote: false,
      boat_tours: {
        id: 'link-1', boat_id: 'boat-1', tour_id: 'tour-1', active: true,
        boats: { active: true, max_guests: 10 },
        tours: { id: 'tour-1', title: 'Zulu Fishing', category: 'Fishing', description: 'Half day fishing trip', image_url: null, included: null, highlights: null, active: true },
      },
    },
    {
      id: 'pkg-2', active: true, name: 'Half Day', package_type: 'half-day', departure_times: null, meal_options: null,
      description: 'Half day fishing', package_included: null, duration_minutes: 240, sort_order: 1,
      base_price: 100, included_guests: 4, max_guests: 8, extra_guest_price: 50, custom_quote: false,
      boat_tours: {
        id: 'link-2', boat_id: 'boat-2', tour_id: 'tour-2', active: true,
        boats: { active: true, max_guests: 8 },
        tours: { id: 'tour-2', title: 'Alpha Fishing', category: 'Fishing', description: 'Half day fishing trip', image_url: null, included: null, highlights: null, active: true },
      },
    },
  ];
  try {
    await page.route('https://admin-test.supabase.co/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/boats')) return route.fulfill({ json: boats });
      if (path.endsWith('/tour_packages')) return route.fulfill({ json: tourPackages });
      if (path.endsWith('/time_slots') || path.endsWith('/tour_images') || path.endsWith('/tour_inclusions') || path.endsWith('/reviews') || path.endsWith('/gallery_images')) return route.fulfill({ json: [] });
      return route.fulfill({ json: [], headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
    });
    await page.goto(`${base}/`);
    const acceptDialog = page.getByRole('dialog').getByRole('button', { name: /Aceptar|Accept/i });
    if (await acceptDialog.isVisible().catch(() => false)) await acceptDialog.click();

    const fleet = page.getByRole('region', { name: /Barcos disponibles|Available boats/i });
    await expect(fleet.getByText('Zulu Boat')).toBeVisible({ timeout: 15000 });
    await expect(fleet.getByText('Alpha Boat')).toBeVisible();

    const fleetText = await fleet.innerText();
    assert.ok(fleetText.indexOf('Zulu Boat') < fleetText.indexOf('Alpha Boat'), `expected "Zulu Boat" (sort_order 1) before "Alpha Boat" (sort_order 2), got: ${fleetText}`);
  } finally {
    await browser.close();
  }
});
