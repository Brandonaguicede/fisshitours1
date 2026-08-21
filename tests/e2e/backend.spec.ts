import { expect, test, type APIRequestContext } from '@playwright/test';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test.setTimeout(180_000);

const FUNCTIONS_URL = 'http://127.0.0.1:54321/functions/v1';
const REST_URL = 'http://127.0.0.1:54321/rest/v1';
const AUTH_URL = 'http://127.0.0.1:54321/auth/v1';
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function loadEnv(relative: string): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = fs.readFileSync(path.join(PROJECT_ROOT, relative), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (match) out[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const rootEnv = loadEnv('.env');
const functionsEnv = loadEnv('supabase/functions/.env.local');
const anonKey = rootEnv.VITE_SUPABASE_ANON_KEY;
const serviceKey = functionsEnv.SUPABASE_SERVICE_ROLE_KEY;
const rateLimitSecret = functionsEnv.RATE_LIMIT_HASH_SECRET;
expect(anonKey).toBeTruthy();
expect(serviceKey).toBeTruthy();
expect(rateLimitSecret).toBeTruthy();

const MOCK_TURNSTILE = 'mock-valid-turnstile';
const BOAT_ID = 'segundo-viento';
const TOUR_ID = 'beach-snorkeling';
const HALF_DAY_PACKAGE = 'second-wind-beach-snorkeling-half';
const DELUXE_PACKAGE = 'second-wind-bioluminescence-deluxe';

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function hmacSha256(value: string): string {
  return crypto.createHmac('sha256', rateLimitSecret).update(value).digest('hex');
}

function uniqueDate(): string {
  return futureDate(90 + crypto.randomInt(0, 1000));
}

function uniqueIp(): string {
  return `203.0.113.${crypto.randomInt(1, 254)}`;
}

function uniqueEmail(): string {
  return `backend-${crypto.randomUUID()}@example.com`;
}

function anonHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function serviceHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function fn(
  api: APIRequestContext,
  name: string,
  body: unknown,
  headers: Record<string, string> = anonHeaders(),
  method = 'POST',
): Promise<{ status: number; body: any }> {
  let last: { status: number; body: any } = { status: -1, body: null };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await api[method.toLowerCase() as 'post'](`${FUNCTIONS_URL}/${name}`, {
      headers,
      data: body,
    });
    last = { status: res.status(), body: await res.json().catch(() => null) };
    if (res.status() < 500 && res.status() !== -1) return last;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return last;
}

async function fnUpload(
  api: APIRequestContext,
  name: string,
  multipart: Record<string, unknown>,
  headers: Record<string, string> = anonHeaders(),
): Promise<{ status: number; body: any }> {
  const multipartHeaders = { ...headers };
  delete multipartHeaders['Content-Type'];
  let last: { status: number; body: any } = { status: -1, body: null };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await api.post(`${FUNCTIONS_URL}/${name}`, { headers: multipartHeaders, multipart });
    last = { status: res.status(), body: await res.json().catch(() => null) };
    if (res.status() < 500) return last;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return last;
}

async function serviceSelect(api: APIRequestContext, table: string, select: string, filter?: string) {
  const url = `${REST_URL}/${table}?select=${encodeURIComponent(select)}${filter ? `&${filter}` : ''}`;
  const res = await api.get(url, { headers: serviceHeaders() });
  expect(res.status()).toBe(200);
  return res.json() as Promise<Record<string, any>[]>;
}

function bookingPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    customer: { fullName: 'Backend Tester', email: uniqueEmail(), whatsapp: '50600000000' },
    boatId: BOAT_ID,
    tourId: TOUR_ID,
    tourPackageId: HALF_DAY_PACKAGE,
    tourDate: uniqueDate(),
    timeSlotId: 'morning',
    guests: 5,
    paymentMethodKey: 'pay-on-day',
    turnstileToken: MOCK_TURNSTILE,
    ...overrides,
  };
}

async function createBooking(
  api: APIRequestContext,
  overrides: Record<string, unknown> = {},
  ip = uniqueIp(),
): Promise<{ status: number; body: any }> {
  return fn(api, 'create-booking', bookingPayload(overrides), anonHeaders({ 'X-Forwarded-For': ip }));
}

async function cancelBooking(api: APIRequestContext, bookingId: string, note = 'cancelled_by_test') {
  const res = await api.post(`${REST_URL}/rpc/mark_paypal_payment_unsuccessful`, {
    headers: serviceHeaders(),
    data: { p_booking_id: bookingId, p_paypal_order_id: '', p_status: note, p_raw_response: {} },
  });
  return { status: res.status(), body: await res.json() };
}

async function signupUser(api: APIRequestContext, email: string) {
  const res = await api.post(`${AUTH_URL}/signup`, {
    headers: anonHeaders(),
    data: { email, password: 'testpass123' },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.access_token).toBeTruthy();
  return body;
}

async function setProfileRole(api: APIRequestContext, userId: string, email: string, role: 'admin' | 'editor' | 'viewer') {
  const res = await api.post(`${REST_URL}/profiles`, {
    headers: serviceHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    data: { id: userId, email, role, active: true },
  });
  expect([200, 201]).toContain(res.status());
}

function pngBuffer(size: number): Buffer {
  const buf = Buffer.alloc(size);
  Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(buf, 0);
  return buf;
}

function reviewPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Backend Reviewer',
    quote: 'Excellent service and crew, highly recommended tour.',
    rating: 5,
    turnstileToken: MOCK_TURNSTILE,
    ...overrides,
  };
}

test.describe('backend flows', () => {
  test('pricing: included guests, extra guests and package totals', async ({ request }) => {
    const cases: Array<[number, number]> = [[1, 650], [5, 650], [6, 715], [10, 975]];
    for (const [guests, expected] of cases) {
      const res = await fn(request, 'calculate-booking-price', {
        tourPackageId: HALF_DAY_PACKAGE,
        guests,
        boatId: BOAT_ID,
        tourId: TOUR_ID,
      });
      expect(res.status).toBe(200);
      expect(res.body.custom_quote).toBe(false);
      expect(res.body.total).toBe(expected);
      expect(res.body.currency).toBe('USD');
    }
  });

  test('pricing: official 2026 boat package matrix examples', async ({ request }) => {
    const cases: Array<{ packageId: string; tourId: string; guests: number; total: number }> = [
      { packageId: 'second-wind-beach-snorkeling-half', tourId: 'beach-snorkeling', guests: 5, total: 650 },
      { packageId: 'second-wind-beach-snorkeling-half', tourId: 'beach-snorkeling', guests: 6, total: 715 },
      { packageId: 'second-wind-fishing-half', tourId: 'fishing', guests: 10, total: 1025 },
      { packageId: 'second-wind-surfing-three-quarter', tourId: 'surfing', guests: 7, total: 880 },
      { packageId: 'second-wind-water-toys-full', tourId: 'water-toys', guests: 10, total: 1475 },
      { packageId: 'second-wind-bioluminescence-classic', tourId: 'bioluminescence', guests: 5, total: 650 },
      { packageId: 'second-wind-bioluminescence-deluxe', tourId: 'bioluminescence', guests: 6, total: 815 },
    ];

    for (const item of cases) {
      const res = await fn(request, 'calculate-booking-price', {
        tourPackageId: item.packageId,
        guests: item.guests,
        boatId: BOAT_ID,
        tourId: item.tourId,
      });
      expect(res.status).toBe(200);
      expect(res.body.base_price).toBeLessThanOrEqual(item.total);
      expect(res.body.included_guests).toBe(5);
      expect(res.body.max_guests).toBe(10);
      expect(res.body.extra_guest_price).toBe(65);
      expect(res.body.total).toBe(item.total);
      expect(res.body.currency).toBe('USD');
    }
  });

  test('pricing: zero, negative and over-capacity guests are rejected', async ({ request }) => {
    for (const guests of [0, -1, 11]) {
      const res = await fn(request, 'calculate-booking-price', {
        tourPackageId: HALF_DAY_PACKAGE,
        guests,
        boatId: BOAT_ID,
        tourId: TOUR_ID,
      });
      if (guests === 11) {
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('capacity');
      } else {
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('Invalid pricing payload');
      }
    }
  });

  test('pricing: nonexistent boat, tour or package are rejected', async ({ request }) => {
    const noBoat = await fn(request, 'calculate-booking-price', {
      tourPackageId: HALF_DAY_PACKAGE, guests: 5, boatId: 'no-such-boat',
    });
    expect(noBoat.status).toBe(404);

    const noPackage = await fn(request, 'calculate-booking-price', {
      tourPackageId: 'no-such-package', guests: 5, boatId: BOAT_ID,
    });
    expect(noPackage.status).toBe(404);
    expect(noPackage.body.message).toContain('not found');

    const wrongTour = await fn(request, 'calculate-booking-price', {
      tourPackageId: HALF_DAY_PACKAGE, guests: 5, boatId: BOAT_ID, tourId: 'fishing',
    });
    expect(wrongTour.status).toBe(400);
    expect(wrongTour.body.message).toContain('does not belong to tour');
  });

  test('pricing: extras are validated against the catalog and priced from Supabase', async ({ request }) => {
    const invalid = await fn(request, 'calculate-booking-price', {
      tourPackageId: DELUXE_PACKAGE, guests: 5, boatId: BOAT_ID, tourId: 'bioluminescence',
      extras: [{ key: 'foie-gras', quantity: 1 }],
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toContain('Invalid extra');

    const notForPackage = await fn(request, 'calculate-booking-price', {
      tourPackageId: HALF_DAY_PACKAGE, guests: 5, boatId: BOAT_ID, tourId: TOUR_ID,
      extras: [{ key: 'cheese-board', quantity: 1 }],
    });
    expect(notForPackage.status).toBe(400);

    const valid = await fn(request, 'calculate-booking-price', {
      tourPackageId: DELUXE_PACKAGE, guests: 5, boatId: BOAT_ID, tourId: 'bioluminescence',
      extras: [{ key: 'cheese-board', quantity: 1 }, { key: 'ceviche', quantity: 2 }],
    });
    expect(valid.status).toBe(200);
    expect(valid.body.extras).toHaveLength(2);
    const byKey = Object.fromEntries(valid.body.extras.map((e: any) => [e.key, e]));
    expect(byKey['cheese-board'].unit_price).toBe(25);
    expect(byKey['ceviche'].total).toBe(40);
    expect(valid.body.extras_total).toBe(65);
    expect(valid.body.total).toBe(815);
  });

  test('pricing: client-supplied total is ignored', async ({ request }) => {
    const res = await fn(request, 'calculate-booking-price', {
      tourPackageId: HALF_DAY_PACKAGE,
      guests: 5,
      boatId: BOAT_ID,
      tourId: TOUR_ID,
      total: 1,
      basePrice: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(650);
  });

  test('booking: valid booking returns 201 with reference, pending statuses and snapshot', async ({ request }) => {
    const res = await createBooking(request);
    expect(res.status).toBe(201);
    expect(res.body.booking_reference).toMatch(/^PFT-[A-Z0-9]{8}$/);
    expect(res.body.total_snapshot).toBe(650);
    expect(res.body.payment_status).toBe('not_required_yet');
    expect(res.body.booking_status).toBe('pending_confirmation');

    const rows = await serviceSelect(request, 'bookings', 'id,booking_reference', `id=eq.${res.body.booking_id}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].booking_reference).toBe(res.body.booking_reference);
  });

  test('booking: missing required fields are rejected', async ({ request }) => {
    const noCustomer = await createBooking(request, { customer: undefined as any });
    expect(noCustomer.status).toBe(400);
    const noBoat = await createBooking(request, { boatId: undefined as any });
    expect(noBoat.status).toBe(400);
  });

  test('booking: invalid email is rejected', async ({ request }) => {
    const res = await createBooking(request, {
      customer: { fullName: 'Backend Tester', email: 'not-an-email', whatsapp: '50600000000' },
    });
    expect(res.status).toBe(400);
  });

  test('booking: past date is rejected', async ({ request }) => {
    const res = await createBooking(request, { tourDate: futureDate(-5) });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('past');
  });

  test('booking: over-capacity guests are rejected', async ({ request }) => {
    const res = await createBooking(request, { guests: 11 });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('capacity');
  });

  test('booking: invalid payment method is rejected', async ({ request }) => {
    const res = await createBooking(request, { paymentMethodKey: 'sinpe' });
    expect(res.status).toBe(400);
  });

  test('booking: invalid IDs are rejected without creating a booking', async ({ request }) => {
    const noBoat = await createBooking(request, { boatId: 'no-such-boat' });
    expect(noBoat.status).toBe(400);
    const noTour = await createBooking(request, { tourId: 'no-such-tour' });
    expect(noTour.status).toBe(400);
    const noPackage = await createBooking(request, { tourPackageId: 'no-such-package' });
    expect(noPackage.status).toBe(400);
  });

  test('booking: client-supplied statuses and prices are ignored', async ({ request }) => {
    const res = await createBooking(request, {
      paymentStatus: 'paid',
      bookingStatus: 'confirmed',
      total: 1,
      basePrice: 1,
      extraGuestPrice: 1,
    } as Record<string, unknown>);
    expect(res.status).toBe(201);
    expect(res.body.total_snapshot).toBe(650);
    expect(res.body.payment_status).toBe('not_required_yet');
    expect(res.body.booking_status).toBe('pending_confirmation');
  });

  test('booking: booking references are unique', async ({ request }) => {
    const first = await createBooking(request);
    const second = await createBooking(request);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.booking_reference).not.toBe(second.body.booking_reference);
  });

  test('booking: extras are stored and priced in total_snapshot', async ({ request }) => {
    const res = await createBooking(request, {
      tourId: 'bioluminescence',
      tourPackageId: DELUXE_PACKAGE,
      guests: 5,
      extras: [{ key: 'cheese-board', quantity: 1 }, { key: 'sparkling-wine', quantity: 1 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.total_snapshot).toBe(805);

    const extras = await serviceSelect(request, 'booking_extras', 'key,quantity,total', `booking_id=eq.${res.body.booking_id}`);
    expect(extras).toHaveLength(2);
    const totals = extras.map((e) => Number(e.total)).sort((a, b) => a - b);
    expect(totals).toEqual([25, 30]);
  });

  test('booking: missing or invalid Turnstile token returns 403', async ({ request }) => {
    const missing = await createBooking(request, { turnstileToken: undefined as any });
    expect(missing.status).toBe(403);
    const invalid = await createBooking(request, { turnstileToken: 'bogus-token' });
    expect(invalid.status).toBe(403);
  });

  test('double booking: second request for the same slot returns 409', async ({ request }) => {
    const date = uniqueDate();
    const first = await createBooking(request, { tourDate: date, timeSlotId: 'morning' });
    expect(first.status).toBe(201);

    const second = await createBooking(request, { tourDate: date, timeSlotId: 'morning' });
    expect(second.status).toBe(409);
    expect(second.body.message).toContain('already reserved');
  });

  test('double booking: slot is unavailable until the booking is cancelled', async ({ request }) => {
    const date = uniqueDate();
    const booking = await createBooking(request, { tourDate: date, timeSlotId: 'morning' });
    expect(booking.status).toBe(201);

    const availability = await fn(request, 'get-booking-availability', { boatId: BOAT_ID, date });
    expect(availability.status).toBe(200);
    const morning = availability.body.slots.find((s: any) => s.id === 'morning');
    expect(morning.available).toBe(false);
  });

  test('double booking: cancelling releases the slot and allows a new booking without deleting history', async ({ request }) => {
    const date = uniqueDate();
    const booking = await createBooking(request, { tourDate: date, timeSlotId: 'morning' });
    expect(booking.status).toBe(201);
    const bookingId = booking.body.booking_id;

    const cancelled = await cancelBooking(request, bookingId);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.payment_status).toBe('failed');
    expect(cancelled.body.booking_status).toBe('cancelled');

    const availability = await fn(request, 'get-booking-availability', { boatId: BOAT_ID, date });
    const morning = availability.body.slots.find((s: any) => s.id === 'morning');
    expect(morning.available).toBe(true);

    const rebooking = await createBooking(request, { tourDate: date, timeSlotId: 'morning' });
    expect(rebooking.status).toBe(201);

    const history = await serviceSelect(request, 'booking_status_history', 'booking_id,new_booking_status', `booking_id=eq.${bookingId}`);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history.some((h) => h.new_booking_status === 'cancelled')).toBe(true);
  });

  test('booking rate limit: more than the allowed requests returns 429 for the same IP', async ({ request }) => {
    const ip = `198.51.100.${100 + (Date.now() % 100)}`;
    const before = await createBooking(request, { boatId: 'no-such-boat' }, ip);
    expect(before.status).toBe(400);
    expect(before.status).not.toBe(429);

    let lastStatus = -1;
    for (let i = 1; i <= 45; i += 1) {
      const res = await createBooking(request, { boatId: 'no-such-boat' }, ip);
      lastStatus = res.status;
      if (res.status === 429) break;
    }
    expect(lastStatus).toBe(429);
    const limitRes = await createBooking(request, { boatId: 'no-such-boat' }, ip);
    expect(limitRes.status).toBe(429);
    expect(limitRes.body.message).toContain('Too many');

    const rows = await serviceSelect(request, 'booking_rate_limits', 'ip_hash');
    for (const row of rows) {
      expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.ip_hash).not.toBe(ip);
    }
    const myHash = hmacSha256(ip);
    expect(rows.some((r) => r.ip_hash === myHash)).toBe(true);
  });

  test('reviews: no token and invalid token return 403', async ({ request }) => {
    const noToken = await fn(request, 'create-review', reviewPayload({ turnstileToken: undefined as any }), anonHeaders({ 'X-Forwarded-For': uniqueIp() }));
    expect(noToken.status).toBe(403);
    const badToken = await fn(request, 'create-review', reviewPayload({ turnstileToken: 'nope' }), anonHeaders({ 'X-Forwarded-For': uniqueIp() }));
    expect(badToken.status).toBe(403);
  });

  test('reviews: valid review is created and stored as pending', async ({ request }) => {
    const quote = 'A truly memorable morning on the water.';
    const res = await fn(request, 'create-review', reviewPayload({ quote, rating: 5 }), anonHeaders({ 'X-Forwarded-For': uniqueIp() }));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');

    const rows = await serviceSelect(request, 'reviews', 'id,status,featured,quote', `id=eq.${res.body.id}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].featured).toBe(false);
    expect(rows[0].quote).toBe(quote);
  });

  test('reviews: rating out of range is rejected', async ({ request }) => {
    const zero = await fn(request, 'create-review', reviewPayload({ rating: 0 }), anonHeaders({ 'X-Forwarded-For': uniqueIp() }));
    expect(zero.status).toBe(400);
    const six = await fn(request, 'create-review', reviewPayload({ rating: 6 }), anonHeaders({ 'X-Forwarded-For': uniqueIp() }));
    expect(six.status).toBe(400);
  });

  test('reviews: HTML and scripts are sanitized', async ({ request }) => {
    const res = await fn(request, 'create-review', reviewPayload({ quote: '<script>alert(1)</script>Great tour' }), anonHeaders({ 'X-Forwarded-For': uniqueIp() }));
    expect(res.status).toBe(201);
    const rows = await serviceSelect(request, 'reviews', 'quote', `id=eq.${res.body.id}`);
    expect(rows[0].quote).not.toContain('<');
    expect(rows[0].quote).not.toContain('>');
  });

  test('reviews: client-supplied status is ignored', async ({ request }) => {
    const res = await fn(request, 'create-review', reviewPayload({ status: 'approved', featured: true }), anonHeaders({ 'X-Forwarded-For': uniqueIp() }));
    expect(res.status).toBe(201);
    const rows = await serviceSelect(request, 'reviews', 'status,featured', `id=eq.${res.body.id}`);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].featured).toBe(false);
  });

  test('reviews: public reviews remain pending until staff approval', async ({ request }) => {
    const ip = `198.51.100.${1 + (Date.now() % 50)}`;
    const created: string[] = [];
    for (let i = 1; i <= 3; i += 1) {
      const res = await fn(request, 'create-review', reviewPayload({ quote: `Review number ${i} for approval` }), anonHeaders({ 'X-Forwarded-For': ip }));
      expect(res.status).toBe(201);
      created.push(res.body.id);
    }
    const ids = `id=in.(${created.join(',')})`;
    const rows = await serviceSelect(request, 'reviews', 'id,status', ids);
    for (const row of rows) expect(row.status).toBe('pending');
  });

  test('reviews: rate limit returns 429 after the hourly limit for the same IP', async ({ request }) => {
    const ip = `198.51.100.${51 + (Date.now() % 40)}`;
    for (let i = 1; i <= 3; i += 1) {
      const res = await fn(request, 'create-review', reviewPayload({ quote: `Rate limited review ${i}` }), anonHeaders({ 'X-Forwarded-For': ip }));
      expect(res.status).toBe(201);
    }
    const blocked = await fn(request, 'create-review', reviewPayload({ quote: 'This one should be rate limited' }), anonHeaders({ 'X-Forwarded-For': ip }));
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toContain('Too many');
  });

  test('storage: upload requires authentication and an admin/editor role', async ({ request }) => {
    const noAuth = await fn(request, 'storage-upload-image', {}, anonHeaders());
    expect([401, 400]).toContain(noAuth.status);

    const viewer = await signupUser(request, uniqueEmail());
    await setProfileRole(request, viewer.user.id, viewer.user.email, 'viewer');
    const viewerRes = await fn(request, 'storage-upload-image', {}, anonHeaders({ Authorization: `Bearer ${viewer.access_token}` }));
    expect(viewerRes.status).toBe(403);
  });

  test('storage: valid PNG upload creates an object, media asset and audit log entry', async ({ request }) => {
    const editor = await signupUser(request, uniqueEmail());
    await setProfileRole(request, editor.user.id, editor.user.email, 'editor');
    const headers = anonHeaders({ Authorization: `Bearer ${editor.access_token}` });

    const res = await fnUpload(request, 'storage-upload-image', {
      file: { name: 'boat.png', mimeType: 'image/png', buffer: pngBuffer(4096) },
      resourceTable: 'boats',
      resourceId: BOAT_ID,
      width: 1200,
      height: 800,
    }, headers);
    expect(res.status).toBe(201);
    const body = res.body;
    expect(body.storage_bucket).toBe('site-images');
    expect(body.mime_type).toBe('image/png');
    expect(body.size_bytes).toBeGreaterThan(0);
    expect(body.width).toBe(1200);
    expect(body.height).toBe(800);
    expect(body.storage_path).toMatch(/^boats\/segundo-viento\/[a-f0-9-]+\.png$/);
    expect(body.public_url).toContain('/storage/v1/object/public/site-images/');

    const assets = await serviceSelect(request, 'media_assets', 'provider,provider_id,storage_bucket,storage_path,mime_type,size_bytes,width,height,resource_table,resource_id', `storage_path=eq.${body.storage_path}`);
    expect(assets).toHaveLength(1);
    expect(assets[0].provider).toBe('supabase_storage');
    expect(assets[0].provider_id).toBe(body.storage_path);
    expect(assets[0].storage_bucket).toBe('site-images');
    expect(assets[0].mime_type).toBe('image/png');
    expect(assets[0].size_bytes).toBeGreaterThan(0);
    expect(assets[0].resource_table).toBe('boats');
    expect(assets[0].resource_id).toBe(BOAT_ID);

    const audit = await serviceSelect(request, 'audit_log', 'action,entity_table,entity_id', `action=eq.storage_image_uploaded`);
    expect(audit.some((a) => a.entity_id === BOAT_ID)).toBe(true);

    const object = await request.get(body.public_url, { headers: anonHeaders() });
    expect(object.status()).toBe(200);
    expect(object.headers()['content-type']).toContain('image/png');
  });

  test('storage: JPEG and WebP uploads are accepted', async ({ request }) => {
    const editor = await signupUser(request, uniqueEmail());
    await setProfileRole(request, editor.user.id, editor.user.email, 'editor');
    const headers = anonHeaders({ Authorization: `Bearer ${editor.access_token}` });

    const jpeg = await fnUpload(request, 'storage-upload-image', {
      file: { name: 'boat.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]) },
      resourceTable: 'boats',
      resourceId: BOAT_ID,
    }, headers);
    expect(jpeg.status).toBe(201);
    expect(jpeg.body.mime_type).toBe('image/jpeg');
    expect(jpeg.body.storage_path).toMatch(/\.jpg$/);

    const webp = await fnUpload(request, 'storage-upload-image', {
      file: { name: 'boat.webp', mimeType: 'image/webp', buffer: Buffer.concat([Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]), Buffer.from([0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20])]) },
      resourceTable: 'boats',
      resourceId: BOAT_ID,
    }, headers);
    expect(webp.status).toBe(201);
    expect(webp.body.mime_type).toBe('image/webp');
    expect(webp.body.storage_path).toMatch(/\.webp$/);
  });

  test('storage: SVG is rejected even when declared as another MIME type', async ({ request }) => {
    const editor = await signupUser(request, uniqueEmail());
    await setProfileRole(request, editor.user.id, editor.user.email, 'editor');
    const headers = anonHeaders({ Authorization: `Bearer ${editor.access_token}` });

    const svg = await fnUpload(request, 'storage-upload-image', {
      file: { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') },
      resourceTable: 'boats',
      resourceId: BOAT_ID,
    }, headers);
    expect(svg.status).toBe(400);

    const fakePng = await fnUpload(request, 'storage-upload-image', {
      file: { name: 'logo.svg', mimeType: 'image/png', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') },
      resourceTable: 'boats',
      resourceId: BOAT_ID,
    }, headers);
    expect(fakePng.status).toBe(400);
    expect(fakePng.body.message).toContain('Invalid image content');
  });

  test('storage: invalid MIME type is rejected', async ({ request }) => {
    const editor = await signupUser(request, uniqueEmail());
    await setProfileRole(request, editor.user.id, editor.user.email, 'editor');
    const headers = anonHeaders({ Authorization: `Bearer ${editor.access_token}` });

    const res = await fnUpload(request, 'storage-upload-image', {
      file: { name: 'evil.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ....') },
      resourceTable: 'boats',
      resourceId: BOAT_ID,
    }, headers);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('MIME');

    const dng = await fnUpload(request, 'storage-upload-image', {
      file: { name: 'raw.dng', mimeType: 'image/x-adobe-dng', buffer: Buffer.from('DNG') },
      resourceTable: 'boats',
      resourceId: BOAT_ID,
    }, headers);
    expect(dng.status).toBe(400);
  });

  test('storage: valid extension with invalid binary signature is rejected', async ({ request }) => {
    const editor = await signupUser(request, uniqueEmail());
    await setProfileRole(request, editor.user.id, editor.user.email, 'editor');
    const headers = anonHeaders({ Authorization: `Bearer ${editor.access_token}` });

    const res = await fnUpload(request, 'storage-upload-image', {
      file: { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('this is not a png at all') },
      resourceTable: 'boats',
      resourceId: BOAT_ID,
    }, headers);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid image content');
  });

  test('storage: mismatched filename extension is rejected', async ({ request }) => {
    const editor = await signupUser(request, uniqueEmail());
    await setProfileRole(request, editor.user.id, editor.user.email, 'editor');
    const headers = anonHeaders({ Authorization: `Bearer ${editor.access_token}` });

    const res = await fnUpload(request, 'storage-upload-image', {
      file: { name: 'fake.jpg', mimeType: 'image/png', buffer: pngBuffer(1024) },
      resourceTable: 'boats',
      resourceId: BOAT_ID,
    }, headers);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('extension');
  });

  test('storage: oversized image is rejected', async ({ request }) => {
    const editor = await signupUser(request, uniqueEmail());
    await setProfileRole(request, editor.user.id, editor.user.email, 'editor');
    const headers = anonHeaders({ Authorization: `Bearer ${editor.access_token}` });

    const res = await fnUpload(request, 'storage-upload-image', {
      file: { name: 'huge.png', mimeType: 'image/png', buffer: pngBuffer(11 * 1024 * 1024) },
      resourceTable: 'boats',
      resourceId: BOAT_ID,
    }, headers);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('too large');
  });

  test('storage: path traversal in resourceId is rejected', async ({ request }) => {
    const editor = await signupUser(request, uniqueEmail());
    await setProfileRole(request, editor.user.id, editor.user.email, 'editor');
    const headers = anonHeaders({ Authorization: `Bearer ${editor.access_token}` });

    const res = await fnUpload(request, 'storage-upload-image', {
      file: { name: 'evil.png', mimeType: 'image/png', buffer: pngBuffer(1024) },
      resourceTable: 'boats',
      resourceId: '../etc',
    }, headers);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid resourceId');
  });

  test('storage: unknown destination folder is rejected', async ({ request }) => {
    const editor = await signupUser(request, uniqueEmail());
    await setProfileRole(request, editor.user.id, editor.user.email, 'editor');
    const headers = anonHeaders({ Authorization: `Bearer ${editor.access_token}` });

    const res = await fnUpload(request, 'storage-upload-image', {
      file: { name: 'evil.png', mimeType: 'image/png', buffer: pngBuffer(1024) },
      resourceTable: 'boats',
      resourceId: BOAT_ID,
      folder: 'bogus',
    }, headers);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid destination folder');
  });

  test('storage: upload for a nonexistent resource is rejected', async ({ request }) => {
    const editor = await signupUser(request, uniqueEmail());
    await setProfileRole(request, editor.user.id, editor.user.email, 'editor');
    const headers = anonHeaders({ Authorization: `Bearer ${editor.access_token}` });

    const res = await fnUpload(request, 'storage-upload-image', {
      file: { name: 'ghost.png', mimeType: 'image/png', buffer: pngBuffer(1024) },
      resourceTable: 'boats',
      resourceId: 'no-such-boat',
    }, headers);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('not found');
  });

  test('storage: deleting an image still referenced by a resource is rejected with 409', async ({ request }) => {
    const editor = await signupUser(request, uniqueEmail());
    await setProfileRole(request, editor.user.id, editor.user.email, 'editor');
    const headers = anonHeaders({ Authorization: `Bearer ${editor.access_token}` });

    const upload = await fnUpload(request, 'storage-upload-image', {
      file: { name: 'inuse.png', mimeType: 'image/png', buffer: pngBuffer(2048) },
      resourceTable: 'boats',
      resourceId: BOAT_ID,
    }, headers);
    expect(upload.status).toBe(201);
    const storagePath = upload.body.storage_path;

    const patch = await request.patch(`${REST_URL}/boats?id=eq.${BOAT_ID}`, {
      headers: serviceHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      data: { image_public_id: storagePath },
    });
    expect(patch.status()).toBe(204);

    try {
      const del = await fn(request, 'storage-delete-image', { storagePath }, headers);
      expect(del.status).toBe(409);
      expect(del.body.message).toContain('referenced');

      const assets = await serviceSelect(request, 'media_assets', 'storage_path', `storage_path=eq.${storagePath}`);
      expect(assets).toHaveLength(1);
    } finally {
      await request.patch(`${REST_URL}/boats?id=eq.${BOAT_ID}`, {
        headers: serviceHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        data: { image_public_id: null },
      });
    }
  });

  test('storage: deleting a free image removes the object, marks asset inactive and records audit', async ({ request }) => {
    const editor = await signupUser(request, uniqueEmail());
    await setProfileRole(request, editor.user.id, editor.user.email, 'editor');
    const headers = anonHeaders({ Authorization: `Bearer ${editor.access_token}` });

    const upload = await fnUpload(request, 'storage-upload-image', {
      file: { name: 'free.png', mimeType: 'image/png', buffer: pngBuffer(2048) },
      resourceTable: 'boats',
      resourceId: BOAT_ID,
    }, headers);
    expect(upload.status).toBe(201);
    const storagePath = upload.body.storage_path;

    const del = await fn(request, 'storage-delete-image', { storagePath }, headers);
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);

    const assets = await serviceSelect(request, 'media_assets', 'storage_path,active,pending_deletion,deleted_at', `storage_path=eq.${storagePath}`);
    expect(assets).toHaveLength(1);
    expect(assets[0].active).toBe(false);
    expect(assets[0].pending_deletion).toBe(false);
    expect(assets[0].deleted_at).toBeTruthy();

    const object = await request.get(upload.body.public_url, { headers: anonHeaders() });
    expect([400, 404]).toContain(object.status());
  });

  test('storage: deleting the current resource image is allowed only with matching resource context', async ({ request }) => {
    const editor = await signupUser(request, uniqueEmail());
    await setProfileRole(request, editor.user.id, editor.user.email, 'editor');
    const headers = anonHeaders({ Authorization: `Bearer ${editor.access_token}` });

    const upload = await fnUpload(request, 'storage-upload-image', {
      file: { name: 'replace-me.png', mimeType: 'image/png', buffer: pngBuffer(2048) },
      resourceTable: 'boats',
      resourceId: BOAT_ID,
    }, headers);
    expect(upload.status).toBe(201);
    const storagePath = upload.body.storage_path;

    const patch = await request.patch(`${REST_URL}/boats?id=eq.${BOAT_ID}`, {
      headers: serviceHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      data: { image_public_id: storagePath, image_url: upload.body.public_url },
    });
    expect(patch.status()).toBe(204);

    try {
      const withoutContext = await fn(request, 'storage-delete-image', { storagePath }, headers);
      expect(withoutContext.status).toBe(409);

      const withContext = await fn(request, 'storage-delete-image', { storagePath, resourceTable: 'boats', resourceId: BOAT_ID }, headers);
      expect(withContext.status).toBe(200);
    } finally {
      await request.patch(`${REST_URL}/boats?id=eq.${BOAT_ID}`, {
        headers: serviceHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        data: { image_public_id: null, image_url: null },
      });
    }
  });

  test('storage: deleting by media asset id works', async ({ request }) => {
    const editor = await signupUser(request, uniqueEmail());
    await setProfileRole(request, editor.user.id, editor.user.email, 'editor');
    const headers = anonHeaders({ Authorization: `Bearer ${editor.access_token}` });

    const upload = await fnUpload(request, 'storage-upload-image', {
      file: { name: 'byid.png', mimeType: 'image/png', buffer: pngBuffer(2048) },
      resourceTable: 'boats',
      resourceId: BOAT_ID,
    }, headers);
    expect(upload.status).toBe(201);
    const assets = await serviceSelect(request, 'media_assets', 'id,storage_path', `storage_path=eq.${upload.body.storage_path}`);
    expect(assets).toHaveLength(1);

    const del = await fn(request, 'storage-delete-image', { mediaAssetId: assets[0].id }, headers);
    expect(del.status).toBe(200);
  });

  test('storage: delete requires editor role and rejects unknown assets', async ({ request }) => {
    const noAuth = await fn(request, 'storage-delete-image', { storagePath: 'boats/x/y.png' }, anonHeaders());
    expect([401, 400]).toContain(noAuth.status);

    const viewer = await signupUser(request, uniqueEmail());
    await setProfileRole(request, viewer.user.id, viewer.user.email, 'viewer');
    const viewerRes = await fn(request, 'storage-delete-image', { storagePath: 'boats/x/y.png' }, anonHeaders({ Authorization: `Bearer ${viewer.access_token}` }));
    expect(viewerRes.status).toBe(403);

    const editor = await signupUser(request, uniqueEmail());
    await setProfileRole(request, editor.user.id, editor.user.email, 'editor');
    const headers = anonHeaders({ Authorization: `Bearer ${editor.access_token}` });
    const missing = await fn(request, 'storage-delete-image', { storagePath: 'boats/ghost/no.png' }, headers);
    expect(missing.status).toBe(404);

    const traversal = await fn(request, 'storage-delete-image', { storagePath: '../secret.png' }, headers);
    expect(traversal.status).toBe(400);
  });

  test('storage: RLS lets anonymous read public objects but blocks anonymous and viewer writes', async ({ request }) => {
    const editor = await signupUser(request, uniqueEmail());
    await setProfileRole(request, editor.user.id, editor.user.email, 'editor');
    const editorHeaders = anonHeaders({ Authorization: `Bearer ${editor.access_token}` });

    const upload = await fnUpload(request, 'storage-upload-image', {
      file: { name: 'public.png', mimeType: 'image/png', buffer: pngBuffer(2048) },
      resourceTable: 'boats',
      resourceId: BOAT_ID,
    }, editorHeaders);
    expect(upload.status).toBe(201);

    const publicRead = await request.get(upload.body.public_url, { headers: anonHeaders() });
    expect(publicRead.status()).toBe(200);

    const anonymousWrite = await request.post(`http://127.0.0.1:54321/storage/v1/object/site-images/boats/segundo-viento/anon.png`, {
      headers: anonHeaders(),
      multipart: { file: { name: 'anon.png', mimeType: 'image/png', buffer: pngBuffer(1024) } },
    });
    expect([400, 403]).toContain(anonymousWrite.status());

    const viewer = await signupUser(request, uniqueEmail());
    await setProfileRole(request, viewer.user.id, viewer.user.email, 'viewer');
    const viewerWrite = await request.post(`http://127.0.0.1:54321/storage/v1/object/site-images/boats/segundo-viento/viewer.png`, {
      headers: anonHeaders({ Authorization: `Bearer ${viewer.access_token}` }),
      multipart: { file: { name: 'viewer.png', mimeType: 'image/png', buffer: pngBuffer(1024) } },
    });
    expect([400, 403]).toContain(viewerWrite.status());
  });

  test('storage: mocks only work in local/test environments', async ({ request }) => {
    const source = fs.readFileSync(path.join(PROJECT_ROOT, 'supabase/functions/_shared/environment.ts'), 'utf8');
    expect(source).toContain('MOCK_EXTERNAL_PROVIDERS');
    expect(source).toContain("'local'");
    expect(source).toContain("'test'");
    expect(source).toContain('127.0.0.1');
  });

  test('paypal: create order for a nonexistent booking returns 404', async ({ request }) => {
    const res = await fn(request, 'paypal-create-order', { bookingId: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(404);
  });

  test('paypal: create order rejects non-paypal bookings', async ({ request }) => {
    const booking = await createBooking(request, { paymentMethodKey: 'pay-on-day' });
    expect(booking.status).toBe(201);
    const res = await fn(request, 'paypal-create-order', { bookingId: booking.body.booking_id });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('not PayPal');
  });

  test('paypal: create order uses the server total snapshot, not client data', async ({ request }) => {
    const booking = await createBooking(request, { paymentMethodKey: 'paypal' });
    expect(booking.status).toBe(201);
    expect(booking.body.total_snapshot).toBe(650);

    const res = await fn(request, 'paypal-create-order', { bookingId: booking.body.booking_id });
    expect(res.status).toBe(200);
    expect(res.body.id).toMatch(/^MOCK-/);
    expect(res.body.amount).toBe('650.00');
    expect(res.body.currency).toBe('USD');
    expect(res.body.bookingId).toBe(booking.body.booking_id);
  });

  test('paypal: capture marks the booking paid but never sets booking_status to paid', async ({ request }) => {
    const booking = await createBooking(request, { paymentMethodKey: 'paypal' });
    expect(booking.status).toBe(201);
    const order = await fn(request, 'paypal-create-order', { bookingId: booking.body.booking_id });
    expect(order.status).toBe(200);

    const capture = await fn(request, 'paypal-capture-order', { bookingId: booking.body.booking_id, orderId: order.body.id });
    expect(capture.status).toBe(200);
    expect(capture.body.payment_status).toBe('paid');
    expect(capture.body.booking_status).toBe('pending_confirmation');
    expect(capture.body.booking_status).not.toBe('paid');

    const rows = await serviceSelect(request, 'bookings', 'payment_status,booking_status,expires_at', `id=eq.${booking.body.booking_id}`);
    expect(rows[0].payment_status).toBe('paid');
    expect(rows[0].booking_status).toBe('pending_confirmation');
    expect(rows[0].expires_at).toBeNull();

    const payments = await serviceSelect(request, 'payments', 'status,provider_capture_id', `booking_id=eq.${booking.body.booking_id}`);
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe('paid');
    expect(payments[0].provider_capture_id).toContain('CAP-');
  });

  test('paypal: capturing with an order that does not belong to the booking is rejected', async ({ request }) => {
    const booking = await createBooking(request, { paymentMethodKey: 'paypal' });
    const other = await createBooking(request, { paymentMethodKey: 'paypal' });
    expect(booking.status).toBe(201);
    expect(other.status).toBe(201);

    const otherOrder = await fn(request, 'paypal-create-order', { bookingId: other.body.booking_id });
    expect(otherOrder.status).toBe(200);

    const capture = await fn(request, 'paypal-capture-order', { bookingId: booking.body.booking_id, orderId: otherOrder.body.id });
    expect(capture.status).toBe(400);
    expect(capture.body.message).toContain('does not match');

    const rows = await serviceSelect(request, 'bookings', 'payment_status', `id=eq.${booking.body.booking_id}`);
    expect(rows[0].payment_status).toBe('pending');
  });

  test('paypal: capturing the same order twice is idempotent', async ({ request }) => {
    const booking = await createBooking(request, { paymentMethodKey: 'paypal' });
    expect(booking.status).toBe(201);
    const order = await fn(request, 'paypal-create-order', { bookingId: booking.body.booking_id });
    expect(order.status).toBe(200);

    const first = await fn(request, 'paypal-capture-order', { bookingId: booking.body.booking_id, orderId: order.body.id });
    expect(first.status).toBe(200);
    const second = await fn(request, 'paypal-capture-order', { bookingId: booking.body.booking_id, orderId: order.body.id });
    expect(second.status).toBe(200);

    const payments = await serviceSelect(request, 'payments', 'status', `booking_id=eq.${booking.body.booking_id}`);
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe('paid');
  });

  test('paypal: webhook without valid signature is rejected', async ({ request }) => {
    const res = await fn(request, 'paypal-webhook', { id: `WEBHOOK-${Date.now()}`, event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: {} }, anonHeaders());
    expect(res.status).toBe(401);
  });

  test('paypal: webhook processes a completed capture and is idempotent', async ({ request }) => {
    const booking = await createBooking(request, { paymentMethodKey: 'paypal' });
    expect(booking.status).toBe(201);
    const order = await fn(request, 'paypal-create-order', { bookingId: booking.body.booking_id });
    expect(order.status).toBe(200);

    const eventId = `WEBHOOK-${Date.now()}`;
    const payload = {
      id: eventId,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: `CAP-WEBHOOK-${Date.now()}`,
        status: 'COMPLETED',
        amount: { value: '650.00', currency_code: 'USD' },
        supplementary_data: { related_ids: { order_id: order.body.id } },
      },
    };

    const first = await fn(request, 'paypal-webhook', payload, anonHeaders({ 'paypal-transmission-id': 'mock-valid-webhook' }));
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);

    const rows = await serviceSelect(request, 'bookings', 'payment_status', `id=eq.${booking.body.booking_id}`);
    expect(rows[0].payment_status).toBe('paid');

    const events = await serviceSelect(request, 'payment_webhook_events', 'id,processed', `provider_event_id=eq.${eventId}`);
    expect(events).toHaveLength(1);
    expect(events[0].processed).toBe(true);

    const second = await fn(request, 'paypal-webhook', payload, anonHeaders({ 'paypal-transmission-id': 'mock-valid-webhook' }));
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);

    const payments = await serviceSelect(request, 'payments', 'status', `booking_id=eq.${booking.body.booking_id}`);
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe('paid');
  });

  test('pay-on-day: booking is created without payment obligation', async ({ request }) => {
    const res = await createBooking(request, { paymentMethodKey: 'pay-on-day' });
    expect(res.status).toBe(201);
    expect(res.body.payment_status).toBe('not_required_yet');
    expect(res.body.booking_status).toBe('pending_confirmation');

    const rows = await serviceSelect(request, 'bookings', 'payment_status,booking_status', `id=eq.${res.body.booking_id}`);
    expect(rows[0].payment_status).toBe('not_required_yet');
    expect(rows[0].booking_status).toBe('pending_confirmation');
  });

  test('security: anonymous users cannot read bookings', async ({ request }) => {
    const res = await request.get(`${REST_URL}/bookings?select=id`, { headers: anonHeaders() });
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(0);
    }
  });

  test('security: anonymous users cannot insert reviews directly', async ({ request }) => {
    const res = await request.post(`${REST_URL}/reviews`, {
      headers: anonHeaders({ Prefer: 'return=minimal' }),
      data: { name: 'Hacker', quote: 'direct insert attempt', rating: 5 },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('security: all public tables have row level security enabled', async () => {
    const sql = "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false;";
    const out = execSync(`docker exec supabase_db_propuesta1 psql -U postgres -d postgres -t -c "${sql}"`, { encoding: 'utf8' });
    expect(out.trim()).toBe('0');
  });

  test('security: secrets are not present in frontend source or build output', async () => {
    const secretNames = [
      'PAYPAL_CLIENT_SECRET',
      'RATE_LIMIT_HASH_SECRET',
      'CLOUDFLARE_TURNSTILE_SECRET_KEY',
      'CLOUDFLARE_IMAGES_API_TOKEN',
      'SUPABASE_SERVICE_ROLE_KEY',
    ];
    const candidates = [serviceKey];
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.(ts|tsx|js|jsx|mjs|css|html|json)$/.test(entry.name)) out.push(full);
      }
      return out;
    };
    const files = walk(path.join(PROJECT_ROOT, 'src'));
    if (fs.existsSync(path.join(PROJECT_ROOT, 'dist'))) {
      files.push(...walk(path.join(PROJECT_ROOT, 'dist')));
    }
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const name of secretNames) expect(content).not.toContain(name);
      for (const value of candidates) expect(content).not.toContain(value);
    }
  });

  test('security: environment files are git-ignored', async () => {
    const out = execSync('git check-ignore .env supabase/functions/.env.local', { encoding: 'utf8' });
    expect(out).toContain('.env');
    expect(out).toContain('.env.local');
  });
});
