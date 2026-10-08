import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as terms from '../supabase/functions/_shared/terms.mjs';

// Loads the REAL shared email module (transpiled, imports stripped) with a fake Supabase. Same technique as booking-email.test.mjs.
function load({ booking: overrides = {}, termsOverride = {} } = {}) {
  const booking = {
    id: 'b-1', booking_reference: 'PFT-TEST', payment_method_key: 'paypal', payment_status: 'paid', tour_date: '2026-10-01', guests: 2,
    special_requests: null, language: 'en', terms_accepted: true, terms_version: 'v1',
    base_price_snapshot: 700, extra_guests_total_snapshot: 0, extras_total_snapshot: 0, departure_surcharge_snapshot: 0,
    subtotal_snapshot: 700, tax_rate_snapshot: 0.13, tax_amount_snapshot: 91, total_snapshot: 791,
    departure_location_name_snapshot: 'Playa Hermosa Dock',
    customers: { full_name: 'Ana', email: 'ana@example.com', whatsapp: '50688888888' },
    boats: { name: 'Second Wind' }, tours: { title: 'Fishing Tour' }, tour_packages: { name: 'Half Day' }, time_slots: { starts_at: '07:00:00' },
    ...overrides,
  };
  const rpcCalls = [];
  const notification = { id: 'n-1', booking_id: 'b-1', sent_at: null, dedupe_key: 'booking:b-1:paypal-confirmation-customer-email' };
  const supabase = {
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; }, is: async () => ({ error: null }), update() { return query; },
        single: async () => ({ data: table === 'booking_notifications' ? notification : booking, error: null }),
        maybeSingle: async () => ({ data: { value: '50686105784' }, error: null }),
      };
      return query;
    },
    rpc: async (name, args) => { rpcCalls.push([name, args]); return { error: null }; },
  };
  const context = vm.createContext({ console, Response, Deno: { env: { get: (key) => ({ BOOKING_ADMIN_EMAIL: 'admin@example.com' })[key] } }, ...terms, ...termsOverride });
  const source = fs.readFileSync('supabase/functions/_shared/booking-confirmation-email.ts', 'utf8').replace(/^\uFEFF/, '').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  const messages = () => context.getBookingConfirmationMessages(supabase, 'b-1');
  return { context, booking, supabase, rpcCalls, messages };
}
const customerOf = (messages) => messages.find((message) => message.to === 'ana@example.com');
const adminOf = (messages) => messages.find((message) => message.to === 'admin@example.com');
const order = (text, ...needles) => { let from = 0; for (const needle of needles) { const index = text.indexOf(needle, from); assert.ok(index >= 0, `"${needle}" missing or out of order (after position ${from})`); from = index + needle.length; } };

test('recommended arrival = real departure time minus 15 min (AM/PM and day change handled)', () => {
  const { context } = load();
  const cases = [['06:00:00', '5:45 AM'], ['07:00', '6:45 AM'], ['12:00:00', '11:45 AM'], ['12:15:00', '12:00 PM'], ['13:30:00', '1:15 PM'], ['00:15:00', '12:00 AM'], ['00:10:00', '11:55 PM (previous day)'], ['00:00:00', '11:45 PM (previous day)'], ['07:05:00', '6:50 AM'], ['23:59:00', '11:44 PM']];
  for (const [startsAt, expected] of cases) assert.equal(context.formatRecommendedArrival(startsAt, 'en'), expected, startsAt);
  assert.equal(context.formatRecommendedArrival('00:00:00', 'es'), '11:45 PM (día anterior)');
  for (const invalid of [null, undefined, '', '25:00:00', 'Morning', '7:00']) assert.equal(context.formatRecommendedArrival(invalid, 'en'), '', String(invalid));
});

test('the customer email shows the departure time AND the recommended arrival computed from it (HTML + text); the admin email does not', async () => {
  for (const [startsAt, departure, arrival] of [['08:00:00', '8:00 AM', '7:45 AM'], ['12:00:00', '12:00 PM', '11:45 AM'], ['00:00:00', '12:00 AM', '11:45 PM (previous day)']]) {
    const { messages } = load({ booking: { time_slots: { starts_at: startsAt } } });
    const all = await messages();
    const customer = customerOf(all);
    assert.match(customer.html, new RegExp(`Departure Time: ${departure}`));
    assert.match(customer.html, new RegExp(`Recommended arrival: <strong>${arrival.replace(/[()]/g, '\\$&')}</strong>`));
    assert.match(customer.text, new RegExp(`Recommended arrival: ${arrival.replace(/[()]/g, '\\$&')}`));
    assert.doesNotMatch(adminOf(all).html, /Llegada recomendada|Recommended arrival/);
    assert.doesNotMatch(adminOf(all).text, /Llegada recomendada|Recommended arrival/);
  }
  const unknown = customerOf(await load({ booking: { time_slots: null } }).messages());
  assert.doesNotMatch(unknown.html, /Recommended arrival|Departure Time/);
});

test('Special requests: a detail row in the customer email (EN/ES, HTML + text) only when the booking has them; escaped; never "None"', async () => {
  const withRequests = customerOf(await load({ booking: { special_requests: 'Birthday celebration, <vegetarian> meal' } }).messages());
  assert.match(withRequests.html, /Special requests<\/td><td[^>]*>Birthday celebration, &lt;vegetarian&gt; meal</);
  assert.match(withRequests.text, /Special requests: Birthday celebration, <vegetarian> meal/);
  const spanish = customerOf(await load({ booking: { language: 'es', special_requests: 'Cumpleaños' } }).messages());
  assert.match(spanish.html, /Solicitudes especiales<\/td><td[^>]*>Cumpleaños</);
  assert.match(spanish.text, /Solicitudes especiales: Cumpleaños/);
  // The privacy clause legitimately mentions "special requests", so only the booking details (everything before the policies) are checked.
  const beforePolicies = (message) => message.html.slice(0, message.html.indexOf('padding-top:18px')) + message.text.slice(0, message.text.indexOf('Terms and Conditions'));
  for (const empty of [null, '', '   ']) {
    const none = customerOf(await load({ booking: { special_requests: empty } }).messages());
    assert.doesNotMatch(beforePolicies(none), /Special requests|Solicitudes especiales/);
    assert.doesNotMatch(none.html + none.text, /\bNone\b|Ninguna/);
  }
  const admin = adminOf(await load({ booking: { special_requests: 'Cumpleaños' } }).messages());
  assert.doesNotMatch(admin.html + admin.text, /Cumpleaños/, 'the operational additions are for the customer email only');
});

test('financial breakdown uses ONLY the stored snapshots (no recalculation), in order, optional rows hidden when they do not apply', async () => {
  // Deliberately NOT what a recalculation would give, to prove nothing is recomputed in the template.
  const full = { base_price_snapshot: 700, extra_guests_total_snapshot: 50, extras_total_snapshot: 25, departure_surcharge_snapshot: 25, subtotal_snapshot: 811.11, tax_rate_snapshot: 0.13, tax_amount_snapshot: 105.44, total_snapshot: 916.55 };
  const customer = customerOf(await load({ booking: full }).messages());
  order(customer.html, 'Package subtotal', '$700.00', 'Additional guests', '$50.00', 'Extras', '$25.00', 'Departure surcharge', '$25.00', '>Subtotal<', '$811.11', 'IVA (13%)', '$105.44', '>Total<', '$916.55', 'Payment status', 'Paid');
  order(customer.text, 'Package subtotal: $700.00', 'Additional guests: $50.00', 'Extras: $25.00', 'Departure surcharge: $25.00', 'Subtotal: $811.11', 'IVA (13%): $105.44', 'Total: $916.55', 'Payment status: Paid');
  const plain = customerOf(await load().messages());
  for (const label of ['Additional guests', 'Extras', 'Departure surcharge']) {
    assert.doesNotMatch(plain.html, new RegExp(label), `${label} hidden in html`);
    assert.doesNotMatch(plain.text, new RegExp(label), `${label} hidden in text`);
  }
  order(plain.html, 'Package subtotal', '>Subtotal<', 'IVA (13%)', '$91.00', '>Total<', '$791.00');
  const surchargeOnly = customerOf(await load({ booking: { departure_surcharge_snapshot: 40 } }).messages());
  assert.match(surchargeOnly.html, /Departure surcharge/);
  assert.doesNotMatch(surchargeOnly.html, /Additional guests|>Extras</);
  const custom = customerOf(await load({ booking: { tax_rate_snapshot: 0.1, tax_amount_snapshot: 70 } }).messages());
  assert.match(custom.html, /IVA \(10%\)/);
  const spanish = customerOf(await load({ booking: { language: 'es', ...full } }).messages());
  order(spanish.html, 'Precio del paquete', 'Personas adicionales', 'Extras', 'Cargo por salida', '>Subtotal<', 'IVA (13%)', '>Total<', 'Estado del pago', 'Pagado');
});

test('Important information box: one clear general recommendation (EN/ES); the concrete time lives in the details above', async () => {
  const en = customerOf(await load().messages());
  assert.match(en.html, /Important information<\/h2><p[^>]*>Please arrive at the departure location at least 15 minutes before the scheduled departure time\.<br><br>If you need to make changes to your reservation, contact us in advance\./);
  const es = customerOf(await load({ booking: { language: 'es' } }).messages());
  assert.match(es.html, /Información importante<\/h2><p[^>]*>Llega al punto de salida al menos 15 minutos antes de la hora programada\.<br><br>Si tienes preguntas o necesitas hacer cambios, contáctanos con anticipación\./);
  assert.match(es.text, /llega al punto de salida al menos 15 minutos antes de la hora programada\. Si tienes preguntas o necesitas hacer cambios, contáctanos con anticipación\./);
  assert.doesNotMatch(admin(await load().messages()).html, /Important information|Información importante/);
  function admin(all) { return adminOf(all); }
});

test('policies of the ACCEPTED version go at the end of the customer confirmation (HTML + plain text), after the WhatsApp CTA, EN and ES', async () => {
  for (const [language, heading, firstClause, lastSection] of [['en', 'Terms and Conditions', 'Bank transfer/PayPal fees will be covered by the client.', 'Privacy and Use of Personal Data'], ['es', 'Términos y Condiciones', 'Las comisiones de transferencia bancaria o PayPal serán cubiertas por el cliente.', 'Privacidad y uso de datos personales']]) {
    const customer = customerOf(await load({ booking: { language } }).messages());
    order(customer.html, 'wa.me/50686105784', heading, firstClause, lastSection);
    order(customer.text, 'wa.me/50686105784', heading, firstClause, lastSection);
    // The accepted version is internal metadata: it is selected from the booking but never shown.
    assert.doesNotMatch(customer.html.replace(/<[^>]+>/g, ' ') + customer.text, /\(v\d+\)|\bv\d+\b|[Vv]ersi[oó]n v?\d|Version v?\d/);
    for (const section of terms.getTerms('v1', language).sections) {
      assert.ok(customer.html.includes(section.title), `html section ${section.title}`);
      for (const item of section.items) { assert.ok(customer.html.includes(item.replace(/'/g, '&#39;')), `html item ${item}`); assert.ok(customer.text.includes(`- ${item}`), `text item ${item}`); }
    }
    assert.match(customer.html, /class="em-line" style="border-top:1px solid #dbe4ec;padding-top:18px"/, 'subtle top divider');
    assert.match(customer.html, /font-size:11px/, 'smaller type than the 14px body');
  }
});

test('the policies are NOT in the Admin email nor in the new-booking alert', async () => {
  const { messages, context, supabase } = load();
  const admin = adminOf(await messages());
  assert.doesNotMatch(admin.html + admin.text, /Términos y Condiciones|fees will be covered|comisiones de transferencia/);
  const requestAdmin = await context.buildBookingRequestAdminHtml(supabase, 'b-1');
  assert.equal(typeof context.buildBookingRequestCustomerHtml, 'undefined', 'the customer "request received" email no longer exists (it only served the retired modality)');
  assert.doesNotMatch(requestAdmin, /Terms and Conditions|Términos y Condiciones|fees will be covered|comisiones de transferencia/);
  const summary = await context.buildBookingRequestSummary(supabase, 'b-1', 'en');
  assert.doesNotMatch(summary, /Terms and Conditions|fees will be covered/);
});

test('a booking keeps ITS version: v1 stays v1 after a v2 exists, an unaccepted/historical booking gets no policies, an unknown version fails loudly', async () => {
  const v2 = { version: 'v2', sections: [{ id: 'new', title: { en: 'Brand new rules', es: 'Reglas nuevas' }, items: [{ en: 'v2-only clause', es: 'cláusula solo v2' }] }] };
  const registry = { ...terms.TERMS_VERSIONS, v2 };
  const termsOverride = { CURRENT_TERMS_VERSION: 'v2', getTerms: (version, language) => terms.getTerms(version, language, registry), renderTermsText: (version, language) => terms.renderTermsText(version, language, registry) };
  const v1Booking = customerOf(await load({ termsOverride }).messages());
  assert.match(v1Booking.html, /fees will be covered/);
  assert.doesNotMatch(v1Booking.html + v1Booking.text, /v2-only clause|Brand new rules/);
  const v2Booking = customerOf(await load({ booking: { terms_version: 'v2' }, termsOverride }).messages());
  assert.match(v2Booking.html, /v2-only clause/);
  assert.doesNotMatch(v2Booking.html, /fees will be covered/);
  const historical = customerOf(await load({ booking: { terms_accepted: false, terms_version: null } }).messages());
  assert.doesNotMatch(historical.html + historical.text, /Terms and Conditions|Términos y Condiciones/);
  await assert.rejects(load({ booking: { terms_version: 'v9' } }).messages(), /Unknown terms version/);
});

test('language: the customer email follows bookings.language (subject, labels, text); the Admin email stays in Spanish; no language = es', async () => {
  const en = await load({ booking: { language: 'en' } }).messages();
  assert.match(customerOf(en).html, /Payment received and booking confirmed/);
  assert.equal(customerOf(en).subject, 'Payment received and booking confirmed - PFT-TEST');
  assert.match(customerOf(en).text, /^Hi Ana,/);
  assert.match(adminOf(en).html, /Pago confirmado/);
  assert.equal(adminOf(en).subject, 'Pago confirmado PFT-TEST');
  assert.match(adminOf(en).text, /^Pago confirmado\./);
  const es = await load({ booking: { language: 'es' } }).messages();
  assert.equal(customerOf(es).subject, 'Pago recibido y reserva confirmada - PFT-TEST');
  assert.match(customerOf(es).text, /^Hola Ana,/);
  assert.match(adminOf(es).html, /Pago confirmado/);
  for (const missing of [undefined, null, 'fr']) assert.equal(customerOf(await load({ booking: { language: missing } }).messages()).subject, 'Pago recibido y reserva confirmada - PFT-TEST');
});

test('PayPal capture, webhook, manual confirmation and the queue worker render the SAME customer content (policies, breakdown, details)', async () => {
  const strip = (message) => ({ html: message.html, text: message.text.replace(/^[\s\S]*?(Reservation:)/, '$1') });
  const { context, supabase, rpcCalls, messages } = load({ booking: { special_requests: 'Vegetarian meal', departure_surcharge_snapshot: 25, subtotal_snapshot: 725, tax_amount_snapshot: 94.25, total_snapshot: 819.25 } });
  await context.enqueueBookingConfirmationEmails(supabase, 'b-1'); // paypal-capture-order / paypal-webhook / admin-confirm-booking / admin-retry all call exactly this
  const queued = rpcCalls[0][1].p_messages;
  const direct = await messages();
  assert.equal(rpcCalls[0][0], 'enqueue_booking_confirmation_emails');
  assert.deepEqual(queued, direct, 'enqueue produces the same messages as a direct render');
  const refreshed = await context.refreshBookingConfirmationNotification(supabase, 'n-1'); // process-booking-emails re-renders at send time
  assert.equal(refreshed.html, customerOf(direct).html);
  assert.equal(refreshed.text, customerOf(direct).text);
  // Manual confirmation (payment still pending) shares the policies + breakdown blocks; only the payment sentence/status differ.
  const manual = customerOf(await load({ booking: { payment_method_key: 'whatsapp-link', payment_status: 'pending', special_requests: 'Vegetarian meal', departure_surcharge_snapshot: 25, subtotal_snapshot: 725, tax_amount_snapshot: 94.25, total_snapshot: 819.25 } }).messages());
  const paid = customerOf(direct);
  const block = (message, start) => message.html.slice(message.html.indexOf(start));
  assert.equal(block(manual, '<tr><td style="padding:0 30px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f8f6'), block(paid, '<tr><td style="padding:0 30px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f8f6'));
  assert.match(manual.html, /Payment status<\/td><td[^>]*>Pending</);
  assert.match(paid.html, /Payment status<\/td><td[^>]*>Paid</);
  void strip;
});

// --- Visual structure of the customer email ----------------------------------------------------------------------------------------------

const luminance = (hex) => { const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const visibleText = (html) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the header is clean: logo, title, confirmation text — no check mark / icon between the logo and the title', async () => {
  for (const language of ['en', 'es']) {
    const { html } = customerOf(await load({ booking: { language } }).messages());
    assert.doesNotMatch(html, /&#10003;|&#x2713;|✓|✔|&check;/);
    const afterLogo = html.slice(html.indexOf('papagayo-logo.png'), html.indexOf('<h1'));
    assert.doesNotMatch(afterLogo, /<div|<span|<svg|<img(?![^>]*papagayo-logo)/, 'nothing but the table cells between the logo and the title');
    assert.match(html, /<h1[^>]*>(Payment received and booking confirmed|Pago recibido y reserva confirmada)<\/h1><p/);
  }
});

test('dark mode: colour-scheme meta + explicit dark palette (prefers-color-scheme and Outlook [data-ogsc]/[data-ogsb]), every themed class is overridden, with readable contrast in BOTH palettes', async () => {
  const { html } = customerOf(await load().messages());
  assert.match(html, /<meta name="color-scheme" content="light dark">/);
  assert.match(html, /<meta name="supported-color-schemes" content="light dark">/);
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  assert.match(css, /:root\{color-scheme:light dark/);
  const used = new Set([...html.replace(/<style[\s\S]*?<\/style>/, '').matchAll(/class="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/)).filter((name) => /^em-(page|card|box|note|head|foot|text|muted|link|foottext|line)$/.test(name)));
  for (const name of used) {
    assert.ok(css.includes(`.${name}{`), `dark override for .${name}`);
    if (name !== 'em-line') assert.ok(/em-(page|card|box|note|head|foot)$/.test(name) ? css.includes(`[data-ogsb] .${name}{`) : css.includes(`[data-ogsc] .${name}{`), `Outlook.com override for .${name}`);
  }
  // Every coloured container also carries bgcolor + an inline background (clients that ignore <style>, Gmail's own inversion).
  for (const tag of html.match(/<(td|table|body)[^>]*(background-color:#[0-9a-f]{6})[^>]*>/gi)) assert.match(tag, /bgcolor="#[0-9a-f]{6}"/i, tag.slice(0, 80));
  // Contrast (WCAG): body text >= 4.5 on every surface it can sit on, in light and in dark.
  const palette = (await load()).context.emailPalette();
  for (const mode of ['light', 'dark']) {
    const p = palette[mode];
    for (const [fg, bg] of [['text', 'page'], ['text', 'card'], ['text', 'box'], ['text', 'note'], ['muted', 'page'], ['muted', 'card'], ['muted', 'box'], ['muted', 'note'], ['link', 'card'], ['footText', 'foot'], ['ctaText', 'cta']]) {
      assert.ok(contrast(p[fg], p[bg]) >= 4.5, `${mode}: ${fg} on ${bg} = ${contrast(p[fg], p[bg]).toFixed(2)}`);
    }
  }
  assert.ok(contrast(palette.light.text, palette.light.card) >= 12);
  assert.notEqual(palette.light.card, palette.dark.card);
  // The logo header stays the brand navy in dark mode (explicit override, never a light/pastel blue), with the logo readable on it.
  assert.equal(palette.dark.head, '#082c4c');
  assert.ok(luminance(palette.dark.head) < 0.03 && contrast('#ffffff', palette.dark.head) >= 12);
  assert.match(html, /class="em-head"[^>]*background-color:#082c4c;background-image:linear-gradient\(#082c4c,#082c4c\)/);
  assert.ok(css.includes('.em-head{background-color:#082c4c !important}') && css.includes('[data-ogsb] .em-head{background-color:#082c4c !important}'));
});

test('the reference / date block stacks on a phone without media queries (fluid inline-block columns), keeps two columns where there is room, and cannot overflow', async () => {
  const { html } = customerOf(await load({ booking: { special_requests: 'x'.repeat(180) } }).messages());
  const block = html.slice(html.indexOf('Booking reference') - 400, html.indexOf('Booking details'));
  const columns = [...block.matchAll(/class="em-col" style="display:inline-block;width:100%;max-width:(\d+)px;vertical-align:top"/g)].map((match) => Number(match[1]));
  assert.equal(columns.length, 2, 'two fluid columns');
  assert.ok(columns.every((width) => width * 2 <= 560), 'two columns fit side by side in the 560px content width, and wrap (stack) below that');
  assert.match(block, /<!--\[if mso\]>/, 'Outlook desktop gets a real two-cell table');
  assert.match(block, /padding:14px 16px/, 'breathing room inside each column');
  assert.match(block, /word-break:break-word/);
  assert.match(html, /@media \(max-width:480px\)\{.*\.em-col\{max-width:100% !important\}/, 'and an explicit stack rule for clients that support media queries');
  assert.doesNotMatch(block, /width:50%[^>]*>(?![\s\S]*if mso)/, 'no fixed 50/50 cells outside the Outlook ghost');
  assert.match(html, /max-width:620px/);
  assert.doesNotMatch(html, /min-width:[5-9]\d\dpx/, 'nothing forces a width wider than a phone');
});

test('invoice layout: every detail / payment row is concept on the LEFT and value on the RIGHT, fixed layout, long values wrap inside their column', async () => {
  const { html } = customerOf(await load({ booking: { special_requests: 'Birthday celebration, vegetarian meal, please bring a cake and a very long note that must wrap cleanly inside the value column without touching the label', departure_surcharge_snapshot: 25, extra_guests_total_snapshot: 50, extras_total_snapshot: 25, subtotal_snapshot: 800, tax_amount_snapshot: 104, total_snapshot: 904 } }).messages());
  const rows = [...html.matchAll(/<tr><td class="em-muted em-line"([^>]*)>([^<]+)<\/td><td class="em-text em-line" align="right"([^>]*)>([^<]*)<\/td><\/tr>/g)];
  const labels = rows.map((match) => match[2]);
  for (const label of ['Tour', 'Boat', 'Package', 'Guests', 'Departure location', 'Special requests', 'Package subtotal', 'Additional guests', 'Extras', 'Departure surcharge', 'Subtotal', 'IVA (13%)', 'Total', 'Payment status']) assert.ok(labels.includes(label), `row "${label}"`);
  for (const match of rows) {
    assert.match(match[3], /text-align:right/);
    assert.match(match[3], /word-break:break-word/);
    assert.match(match[1] + match[3], /width:4\d%|width:5\d%/);
  }
  assert.ok((html.match(/table-layout:fixed/g) ?? []).length >= 2, 'the detail and payment tables use a fixed layout');
  // Same pattern in Spanish (labels per the approved copy) and the totals row is emphasised.
  const es = customerOf(await load({ booking: { language: 'es', special_requests: 'Cumpleaños' } }).messages()).html;
  for (const label of ['Punto de encuentro', 'Solicitudes especiales', 'Precio del paquete', 'Estado del pago']) assert.ok(es.includes(`>${label}</td><td`), `ES row "${label}"`);
  assert.match(html, />Total<\/td><td[^>]*font-size:17px/, 'Total is the emphasised row');
});

test('policies at the bottom: after the CTA and the signature, a discreet divider + smaller text, includes Privacy, and NEVER a version', async () => {
  for (const [language, privacyTitle, privacyClause] of [['en', 'Privacy and Use of Personal Data', 'Personal information will not be sold to third parties for advertising or commercial purposes.'], ['es', 'Privacidad y uso de datos personales', 'Los datos personales no serán vendidos a terceros con fines publicitarios o comerciales.']]) {
    const { html, text } = customerOf(await load({ booking: { language } }).messages());
    order(html, 'wa.me/50686105784', 'Pura Vida', 'padding-top:18px', privacyTitle, privacyClause, 'papagayofishingtourcr.com');
    order(text, 'WhatsApp: https://wa.me/50686105784', 'Pura Vida', privacyTitle, privacyClause);
    assert.doesNotMatch(visibleText(html) + text, /\bv\d+\b|\(v\d+\)|Versi[oó]n|Version/);
    const footer = html.slice(html.indexOf('padding-top:18px'), html.lastIndexOf('papagayofishingtourcr.com'));
    assert.match(footer, /font-size:11px/);
    assert.ok(footer.length > 3000, 'the full v1 policies are there');
  }
  const admin = adminOf(await load().messages());
  assert.doesNotMatch(admin.html + admin.text, /Privacy and Use of Personal Data|Privacidad y uso de datos personales/);
});
