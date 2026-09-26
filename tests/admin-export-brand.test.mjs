// Export brand consistency (block K): the "Resumen de paquetes" PDF, the "Reservas" PDF and the "Reservas" .xlsx must read
// as one family — same logo (public/images/papagayo-logo.png), name, palette, generation stamp, filters summary, USD
// wording, footers with page numbers — and each must keep its own data. Runs the real modules in the dev server.
import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const bs = String.fromCharCode(92);
const STAMP = 'Generado el 24 de septiembre de 2026';
const FILTERS = ['Estado: Activos', 'Búsqueda: "Second"'];

async function fixture() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) return route.fulfill({ json: { access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600, user } });
    if (path.endsWith('/profiles')) return route.fulfill({ json: { ...user, full_name: 'Test Admin', role: 'admin', active: true } });
    if (path.endsWith('/user')) return route.fulfill({ json: user });
    return route.fulfill({ json: [], headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
  });
  const logoRequests = [];
  page.on('request', (request) => { if (request.url().includes('papagayo-logo')) logoRequests.push(new URL(request.url()).pathname); });
  await page.goto(`${base}/admin/login`);
  await page.getByPlaceholder('admin@example.com').fill(user.email);
  await page.getByPlaceholder('Password').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page.getByText('Reservas totales')).toBeVisible();
  return { browser, page, logoRequests };
}

// Builds the three exports from the same inputs inside the app (so the real modules and the real logo are used).
async function buildAll(page, { withLogo, packageRows, reservationRows }) {
  return page.evaluate(async ({ withLogo, packageRows, reservationRows, filters }) => {
    const brand = await import('/src/utils/exportBrand.ts');
    const { createPackagesPdf } = await import('/src/utils/packagesPdf.ts');
    const { createReservationsPdf } = await import('/src/utils/reservationsPdf.ts');
    const { createReservationsXlsx } = await import('/src/utils/reservationsExport.ts');
    const logo = withLogo ? await brand.loadLogoDataUrl() : null;
    const generatedAt = new Date(2026, 8, 24, 20, 41);
    const raw = (doc) => { const buffer = new Uint8Array(doc.output('arraybuffer')); let text = ''; for (const byte of buffer) text += String.fromCharCode(byte); return text; };
    const packages = await createPackagesPdf({ rows: packageRows, filters, generatedAt, logoDataUrl: logo, compress: false });
    const reservations = await createReservationsPdf({ rows: reservationRows, filters, generatedAt, logoDataUrl: logo, compress: false });
    const xlsx = await createReservationsXlsx({ rows: reservationRows, filters, generatedAt, logoDataUrl: logo });
    return {
      hasLogo: Boolean(logo), logoPath: brand.LOGO_PATH, usd: brand.formatUsd(1250), brandName: brand.BRAND,
      packages: { text: raw(packages), pages: packages.getNumberOfPages() },
      reservations: { text: raw(reservations), pages: reservations.getNumberOfPages() },
      xlsx: Array.from(new Uint8Array(await xlsx.arrayBuffer())),
    };
  }, { withLogo, packageRows, reservationRows, filters: FILTERS });
}

const packageRows = (count) => Array.from({ length: count }, (_, n) => ({ name: `Package ${n + 1}`, boat: 'Second Wind', tour: 'Fishing Tour', price: '$1,250.00', capacity: '5 / 10', duration: '4 h', status: n % 3 ? 'Activo' : 'Inactivo' }));
const reservationRows = (count) => Array.from({ length: count }, (_, n) => ({ reference: `PFT-${n + 1}`, tourDate: '2026-10-05', time: '7:00 AM', customer: `Cliente ${n + 1}`, email: 'a@b.c', whatsapp: '+506 8888 0000', boat: 'Second Wind', tour: 'Fishing Tour', guests: 4, departure: 'Marina', departureSurcharge: 25, total: 1250, paymentMethod: 'PayPal', paymentStatus: 'Pagado', bookingStatus: 'Confirmada', notes: '', createdAt: '2026-09-20T14:30:00Z' }));

const clean = (text) => text.replaceAll(`${bs}(`, '(').replaceAll(`${bs})`, ')').replaceAll(`${bs}341`, 'á');
const fillColors = (text) => new Set([...text.matchAll(/(\d*\.?\d+ \d*\.?\d+ \d*\.?\d+) rg\b/g)].map((match) => match[1]));

test('the three exports share one brand: name, logo, stamp, filters, USD wording, footer with page numbers', async () => {
  const f = await fixture(); const { page, logoRequests } = f;
  try {
    const result = await buildAll(page, { withLogo: true, packageRows: packageRows(45), reservationRows: reservationRows(40) });
    assert.equal(result.hasLogo, true);
    assert.equal(result.logoPath, '/images/papagayo-logo.png');
    assert.ok(logoRequests.length >= 1 && logoRequests.every((path) => path === '/images/papagayo-logo.png'), `logo requested from ${logoRequests}`);
    assert.equal(result.usd, '$1,250.00');
    assert.equal(result.brandName, 'Papagayo Fishing Tour');

    for (const [name, pdf, title, count] of [['packages', result.packages, 'Resumen de paquetes', '45 paquetes'], ['reservations', result.reservations, 'Reporte de reservas', '40 reservas']]) {
      const text = clean(pdf.text);
      assert.ok(pdf.pages >= 2, `${name}: paginates`);
      for (const expected of [title, count, STAMP, 'FILTROS', 'Estado: Activos', 'Búsqueda: "Second"', 'Papagayo Fishing Tour · Costa Rica', 'Montos en USD', '(USD)', '$1,250.00', `Página 1 de ${pdf.pages}`, `Página ${pdf.pages} de ${pdf.pages}`]) {
        assert.ok(text.includes(expected), `${name} PDF must contain "${expected}"`);
      }
      assert.ok(text.includes('/Subtype /Image'), `${name}: the logo is embedded`);
      // Every continuation page repeats the slim brand band (title left, brand right): once per extra page.
      const bandBrand = text.split('Papagayo Fishing Tour').length - 1;
      assert.ok(bandBrand >= pdf.pages - 1, `${name}: continuation pages carry the brand`);
    }
    // Same palette in both PDFs (band, table header, stripes, text colours).
    const shared = [...fillColors(result.packages.text)].filter((color) => fillColors(result.reservations.text).has(color));
    assert.ok(shared.length >= 4, `the PDFs share their palette (${shared})`);

    // The workbook: same brand, on its own terms (data sheet + Resumen sheet).
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(result.xlsx));
    const summary = workbook.getWorksheet('Resumen');
    assert.equal(summary.getCell('A1').fill.fgColor.argb, 'FF0B2842', 'title band uses the same deep-ocean ink');
    assert.equal(workbook.getWorksheet('Reservas').getRow(1).getCell(1).fill.fgColor.argb, 'FF2B5F82', 'header uses the same primary colour');
    assert.equal(summary.getImages().length, 1, 'the logo sits on the Resumen title band');
    assert.equal(summary.getCell('B3').value, 'Papagayo Fishing Tour');
    assert.ok(`Generado el ${summary.getCell('B4').value}`.startsWith(STAMP), 'same generation stamp as the PDFs');
    assert.match(summary.getCell('B6').value, /USD/, 'USD stated');
    assert.equal(summary.getCell('B7').value, FILTERS.join('  ·  '));
    const sheet = workbook.getWorksheet('Reservas');
    assert.equal(sheet.views[0].state, 'frozen'); assert.equal(sheet.views[0].ySplit, 1);
    assert.ok(sheet.autoFilter, 'auto filter on the header');
    assert.equal(sheet.getRow(2).getCell(12).numFmt, '"$"#,##0.00', 'money looks like the PDFs: $1,250.00');
    assert.equal(sheet.getRow(2).getCell(12).value, 1250);
    assert.match(sheet.headerFooter.oddFooter, /Papagayo Fishing Tour/);
    assert.match(sheet.headerFooter.oddFooter, /Página &P de &N/);
    assert.equal(sheet.pageSetup.orientation, 'landscape');
    assert.ok(Buffer.from(result.xlsx).includes(Buffer.from('xl/media/image1.png')), 'the logo is a PNG media part');
  } finally { await f.browser.close(); }
});

test('without a logo all three exports fall back to the text brand and stay valid', async () => {
  const f = await fixture(); const { page } = f;
  try {
    const result = await buildAll(page, { withLogo: false, packageRows: packageRows(3), reservationRows: reservationRows(3) });
    for (const [name, pdf, subtitle] of [['packages', result.packages, 'Papagayo Fishing Tour · Botes'], ['reservations', result.reservations, 'Papagayo Fishing Tour · Clientes']]) {
      const text = clean(pdf.text);
      assert.ok(text.includes(subtitle), `${name}: brand name replaces the logo`);
      assert.ok(!text.includes('/Subtype /Image'), `${name}: no image`);
      assert.equal(pdf.pages, 1);
    }
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(result.xlsx));
    assert.equal(workbook.getWorksheet('Resumen').getImages().length, 0);
    assert.equal(workbook.getWorksheet('Reservas').rowCount, 4);
  } finally { await f.browser.close(); }
});

test('every export keeps its own data: package prices, boat/tour, reservation totals and statuses are unchanged', async () => {
  const f = await fixture(); const { page } = f;
  try {
    const result = await buildAll(page, { withLogo: false, packageRows: packageRows(3), reservationRows: reservationRows(3) });
    const packages = clean(result.packages.text);
    for (const expected of ['Package 1)', 'Package 3)', 'Second Wind', 'Fishing Tour', '5 / 10', '4 h', 'Precio base (USD)', 'Incluidos / máx.', 'Inactivo', 'Activo']) assert.ok(packages.includes(expected), `packages PDF must contain "${expected}"`);
    const reservations = clean(result.reservations.text);
    for (const expected of ['PFT-1)', 'PFT-3)', 'Cliente 1)', '05/10/2026', 'PayPal', 'Pagado', 'Confirmada', 'Marina']) assert.ok(reservations.includes(expected), `reservations PDF must contain "${expected}"`);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(result.xlsx));
    const sheet = workbook.getWorksheet('Reservas');
    assert.equal(sheet.getRow(2).getCell(1).value, 'PFT-1');
    assert.equal(sheet.getRow(2).getCell(9).value, 4);
    assert.equal(sheet.getRow(2).getCell(11).value, 25);
    assert.equal(sheet.getRow(2).getCell(14).value, 'Pagado');
  } finally { await f.browser.close(); }
});
