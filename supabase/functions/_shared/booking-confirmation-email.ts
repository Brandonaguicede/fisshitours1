import { createClient } from 'npm:@supabase/supabase-js@2';
import { getTerms, renderTermsText } from './terms.mjs';

type SupabaseClient = ReturnType<typeof createClient>;
type ConfirmationMessage = { to: string; subject: string; text: string; html: string; dedupe: string };
type Language = 'es' | 'en';

// The language of a booking is persisted in bookings.language (set by create-booking / the Admin form), so every path that renders the
// customer's confirmation (PayPal capture / webhook, manual confirmation, the queue worker re-rendering at send time) uses the SAME language
// without any caller having to know it. Request-received emails (create-booking) still receive it explicitly: they are sent in the same
// request. Defaults to 'es' only for rows that predate the column (the migration's default).
const DEFAULT_LANGUAGE: Language = 'es';
const bookingLanguage = (value: unknown): Language => (value === 'en' ? 'en' : 'es');

export async function enqueueBookingConfirmationEmails(supabase: SupabaseClient, bookingId: string) {
  const messages = await getBookingConfirmationMessages(supabase, bookingId);
  if (!messages.length) return;
  const { error } = await supabase.rpc('enqueue_booking_confirmation_emails', { p_booking_id: bookingId, p_messages: messages });
  if (error) throw error;
}

export async function refreshBookingConfirmationNotification(supabase: SupabaseClient, notificationId: string) {
  const { data: notification, error } = await supabase.from('booking_notifications').select('id, booking_id, dedupe_key, sent_at').eq('id', notificationId).single();
  if (error) throw error;
  if (notification.sent_at) return null;
  const messages = await getBookingConfirmationMessages(supabase, notification.booking_id);
  const message = messages.find((candidate) => candidate.dedupe === notification.dedupe_key);
  if (!message) return null;
  const { error: updateError } = await supabase.from('booking_notifications').update({ payload: { to: message.to, subject: message.subject, text: message.text, html: message.html } }).eq('id', notification.id).is('sent_at', null);
  if (updateError) throw updateError;
  return message;
}

async function getBookingConfirmationMessages(supabase: SupabaseClient, bookingId: string): Promise<ConfirmationMessage[]> {
  const { data: booking, error } = await supabase.from('bookings').select(`id, booking_reference, payment_method_key, payment_status, tour_date, guests, special_requests, language, terms_accepted, terms_version, base_price_snapshot, extra_guests_total_snapshot, extras_total_snapshot, departure_surcharge_snapshot, subtotal_snapshot, tax_rate_snapshot, tax_amount_snapshot, total_snapshot, departure_location_name_snapshot, customers(full_name, email, whatsapp), boats(name), tours(title), tour_packages(name), time_slots(starts_at)`).eq('id', bookingId).single();
  if (error) throw error;
  if (!booking?.customers?.email) return [];
  const language = bookingLanguage(booking.language);
  const es = language === 'es';
  const adminEmail = Deno.env.get('BOOKING_ADMIN_EMAIL');
  const { data: whatsappSetting } = await supabase.from('site_settings').select('value').eq('key', 'whatsapp_number').eq('active', true).maybeSingle();
  const whatsappNumber = String(whatsappSetting?.value ?? '50686105784').replace(/\D/g, '');
  const paid = booking.payment_status === 'paid';
  const dateLabel = formatDate(booking.tour_date, language);
  const timeLabel = formatDepartureTime(booking.time_slots?.starts_at);
  const packageName = booking.tour_packages?.name ?? '';
  const paidLabel = es ? (paid ? 'Pagado' : 'Pendiente') : (paid ? 'Paid' : 'Pending');
  const summary = bookingSummaryLines(booking, language, { dateLabel, timeLabel, paymentLabel: paidLabel, operational: true }).join('\n');
  // The exact version the customer accepted (immutable on the booking). A booking that predates terms acceptance has none: no policies are
  // invented for it. An unknown version throws (getTerms never falls back to the current one).
  const termsVersion: string | null = booking.terms_accepted && booking.terms_version ? booking.terms_version : null;
  const termsText = termsVersion ? `\n\n${renderTermsText(termsVersion, language)}` : '';
  const customerText = es
    ? `Hola ${booking.customers.full_name},\n\n${paid ? (booking.payment_method_key === 'paypal' ? 'Tu pago de PayPal fue recibido correctamente.' : 'Tu pago fue recibido correctamente.') : 'Tu reserva esta confirmada y el pago queda pendiente.'} ${paid ? 'Tu reserva esta confirmada.' : ''} Muchas gracias por reservar con Papagayo Fishing Tours.\n\n${summary}\n\nInformación importante: llega al punto de salida al menos 15 minutos antes de la hora programada. Si tienes preguntas o necesitas hacer cambios, contáctanos con anticipación.\n\nWhatsApp: https://wa.me/${whatsappNumber}\n\nPura Vida,\nPapagayo Fishing Tours${termsText}`
    : `Hi ${booking.customers.full_name},\n\n${paid ? (booking.payment_method_key === 'paypal' ? 'Your PayPal payment was received successfully.' : 'Your payment was received successfully.') : 'Your booking is confirmed and payment is still pending.'} ${paid ? 'Your booking is confirmed.' : ''} Thank you very much for booking with Papagayo Fishing Tours.\n\n${summary}\n\nImportant information: please arrive at the departure location at least 15 minutes before the scheduled departure time. If you need to make changes to your reservation, contact us in advance.\n\nWhatsApp: https://wa.me/${whatsappNumber}\n\nPura Vida,\nPapagayo Fishing Tours${termsText}`;
  const messages: ConfirmationMessage[] = [{
    to: booking.customers.email,
    subject: es ? `Pago recibido y reserva confirmada - ${booking.booking_reference}` : `Payment received and booking confirmed - ${booking.booking_reference}`,
    text: customerText,
    html: buildBookingHtml({ name: booking.customers.full_name, reference: booking.booking_reference, date: dateLabel, time: timeLabel, arrival: formatRecommendedArrival(booking.time_slots?.starts_at, language), tour: booking.tours?.title, boat: booking.boats?.name, packageName, guests: booking.guests, departureLocation: booking.departure_location_name_snapshot, specialRequests: String(booking.special_requests ?? '').trim(), termsVersion, ...bookingEmailAmounts(booking), total: formatEmailUsd(Number(booking.total_snapshot ?? 0)), paymentStatus: paidLabel, whatsappNumber, language }),
    dedupe: `booking:${booking.id}:paypal-confirmation-customer-email`,
  }];
  if (adminEmail) {
    // Admin-facing — stays in the business's own operating language
    // (Spanish, same as the rest of the Admin UI) regardless of which
    // language the customer used, per the same rule that keeps internal
    // notifications fixed rather than following the visitor's toggle.
    const adminHeading = paid ? 'Pago confirmado' : 'Reserva confirmada desde el panel';
    const adminSummary = bookingSummaryLines(booking, 'es', { dateLabel: formatDate(booking.tour_date, 'es'), timeLabel, paymentLabel: paid ? 'Pagado' : 'Pendiente', operational: false }).join('\n');
    messages.push({
      to: adminEmail,
      subject: `${paid ? 'Pago confirmado' : 'Reserva confirmada'} ${booking.booking_reference}`,
      text: `${paid ? 'Pago confirmado.' : 'Reserva confirmada desde el panel de administración.'}\n\n${adminSummary}`,
      html: buildBookingHtml({
        name: booking.customers.full_name,
        reference: booking.booking_reference,
        date: formatDate(booking.tour_date, 'es'),
        time: timeLabel,
        tour: booking.tours?.title,
        boat: booking.boats?.name,
        packageName,
        guests: booking.guests,
        departureLocation: booking.departure_location_name_snapshot,
        ...bookingEmailAmounts(booking), total: formatEmailUsd(Number(booking.total_snapshot ?? 0)),
        paymentStatus: paid ? 'Pagado' : 'Pendiente',
        whatsappNumber: (booking.customers.whatsapp ?? '').replace(/\D/g, '') || whatsappNumber,
        heading: adminHeading,
        introduction: paid ? 'El pago del cliente fue recibido correctamente.' : 'La reserva fue confirmada manualmente desde el panel de administración.',
        contact: { email: booking.customers.email, whatsapp: booking.customers.whatsapp },
        ctaLabel: 'Contactar al cliente por WhatsApp',
        language: 'es',
      }),
      dedupe: `booking:${booking.id}:paypal-confirmation-admin-email`,
    });
  }
  return messages;
}

export async function buildBookingRequestCustomerHtml(supabase: SupabaseClient, bookingId: string, language: Language = DEFAULT_LANGUAGE): Promise<string> {
  const es = language === 'es';
  const booking = await fetchBookingForEmail(supabase, bookingId);
  const whatsappNumber = await getBusinessWhatsapp(supabase);
  return buildBookingHtml({
    name: booking.customers?.full_name ?? '',
    reference: booking.booking_reference,
    date: formatDate(booking.tour_date, language),
    time: formatDepartureTime(booking.time_slots?.starts_at),
    tour: booking.tours?.title,
    boat: booking.boats?.name,
    packageName: booking.tour_packages?.name,
    guests: booking.guests,
    departureLocation: booking.departure_location_name_snapshot,
    ...bookingEmailAmounts(booking), total: formatEmailUsd(Number(booking.total_snapshot ?? 0)),
    paymentStatus: es ? 'Pendiente' : 'Pending',
    whatsappNumber,
    heading: es ? 'Solicitud de reserva recibida' : 'Booking request received',
    introduction: es
      ? 'Hemos recibido tu solicitud de reserva. Nuestro equipo confirmará la disponibilidad y te contactará pronto.'
      : 'We have received your booking request. Our team will confirm availability and contact you soon.',
    language,
  });
}

// Admin-facing counterpart to buildBookingRequestCustomerHtml — same branded
// template (not a plain-text dump) so a new-booking alert looks like it
// belongs to the business, plus a contact block and a WhatsApp CTA aimed at
// the customer's own number (the admin needs to reach the customer, not the
// business itself). Always Spanish — the business's own operating language,
// independent of whichever language the customer booked in.
export async function buildBookingRequestAdminHtml(supabase: SupabaseClient, bookingId: string): Promise<string> {
  const booking = await fetchBookingForEmail(supabase, bookingId);
  const fallbackWhatsapp = await getBusinessWhatsapp(supabase);
  return buildBookingHtml({
    name: booking.customers?.full_name ?? '',
    reference: booking.booking_reference,
    date: formatDate(booking.tour_date, 'es'),
    time: formatDepartureTime(booking.time_slots?.starts_at),
    tour: booking.tours?.title,
    boat: booking.boats?.name,
    packageName: booking.tour_packages?.name,
    guests: booking.guests,
    departureLocation: booking.departure_location_name_snapshot,
    ...bookingEmailAmounts(booking), total: formatEmailUsd(Number(booking.total_snapshot ?? 0)),
    paymentStatus: 'Pendiente',
    whatsappNumber: (booking.customers?.whatsapp ?? '').replace(/\D/g, '') || fallbackWhatsapp,
    heading: 'Nueva reserva recibida',
    introduction: 'Un cliente acaba de solicitar una reserva. Confirma la disponibilidad y contáctalo pronto.',
    contact: { email: booking.customers?.email ?? '', whatsapp: booking.customers?.whatsapp ?? '' },
    ctaLabel: 'Contactar al cliente por WhatsApp',
    language: 'es',
  });
}

async function fetchBookingForEmail(supabase: SupabaseClient, bookingId: string) {
  const { data: booking, error } = await supabase.from('bookings')
    .select('booking_reference, tour_date, guests, base_price_snapshot, extra_guests_total_snapshot, extras_total_snapshot, departure_surcharge_snapshot, subtotal_snapshot, tax_rate_snapshot, tax_amount_snapshot, total_snapshot, departure_location_name_snapshot, customers(full_name, email, whatsapp), boats(name), tours(title), tour_packages(name), time_slots(starts_at)')
    .eq('id', bookingId).single();
  if (error) throw error;
  if (!booking) throw new Error('Booking email details not found');
  return booking;
}

async function getBusinessWhatsapp(supabase: SupabaseClient) {
  const { data: whatsappSetting } = await supabase.from('site_settings')
    .select('value').eq('key', 'whatsapp_number').eq('active', true).maybeSingle();
  return String(whatsappSetting?.value ?? '50686105784').replace(/\D/g, '');
}

// ---- Email colours -----------------------------------------------------------------------------------------------------------------
// `light` is the Papagayo look. `dark` is an explicit dark palette for the clients that honour it (Apple Mail / iOS Mail, Outlook, Samsung
// Mail via prefers-color-scheme; Outlook.com via [data-ogsc] / [data-ogsb]). Gmail applies its own automatic inversion, so every element also
// carries explicit inline colours + bgcolor (no inherited / transparent / semi-transparent colours) to keep that inversion predictable.
const EMAIL_PALETTE = {
  light: { page: '#f1f6f8', card: '#ffffff', box: '#eaf4f8', note: '#e3f0fa', head: '#082c4c', foot: '#082c4c', text: '#0f2742', muted: '#51647a', line: '#dbe4ec', link: '#0b6e99', footText: '#dbeafe', cta: '#0e7f5d', ctaText: '#ffffff' },
  // Dark keeps the brand navy (the header / logo blue family), not a neutral grey: deep navy page, brand-navy card, lighter navy highlight
  // blocks, and an "Important information" block that is the sky blue of the brand at ~18% over the card (a translucent-looking blue).
  dark: { page: '#061b2f', card: '#0b2842', box: '#12395f', note: '#173d5c', head: '#082c4c', foot: '#041a2e', text: '#eaf3fb', muted: '#b3c8dc', line: '#2a5683', link: '#8fd0f5', footText: '#c9dcee', cta: '#0e7f5d', ctaText: '#ffffff' },
} as const;
function emailPalette() { return EMAIL_PALETTE; }

function emailHeadStyles() {
  const d = EMAIL_PALETTE.dark;
  const background: Array<[string, string]> = [['em-head', d.head], ['em-page', d.page], ['em-card', d.card], ['em-box', d.box], ['em-note', d.note], ['em-foot', d.foot]];
  const color: Array<[string, string]> = [['em-text', d.text], ['em-muted', d.muted], ['em-link', d.link], ['em-foottext', d.footText]];
  const media = `${background.map(([name, value]) => `.${name}{background-color:${value} !important}`).join('')}${color.map(([name, value]) => `.${name}{color:${value} !important}`).join('')}.em-line{border-color:${d.line} !important}`;
  const outlookBackground = background.map(([name, value]) => `[data-ogsb] .${name}{background-color:${value} !important}`).join('');
  const outlookColor = color.map(([name, value]) => `[data-ogsc] .${name}{color:${value} !important}`).join('') + `[data-ogsc] .em-line{border-color:${d.line} !important}`;
  return `:root{color-scheme:light dark;supported-color-schemes:light dark}body,table,td{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}@media (max-width:480px){.em-pad{padding-left:18px !important;padding-right:18px !important}.em-col{max-width:100% !important}}@media (prefers-color-scheme:dark){${media}}${outlookBackground}${outlookColor}`;
}

function buildBookingHtml(input: { name: string; reference: string; date: string; time: string; arrival?: string; specialRequests?: string; termsVersion?: string | null; tour?: string | null; boat?: string | null; packageName?: string | null; guests: number; departureLocation?: string | null; basePrice?: string; subtotal?: string; taxAmount?: string; taxRate?: number; extraGuestsTotal?: string; extrasTotal?: string; departureSurcharge?: string; total: string; paymentStatus: string; whatsappNumber: string; heading?: string; introduction?: string; contact?: { email: string; whatsapp: string } | null; ctaLabel?: string; language: Language }) {
  const es = input.language === 'es';
  const e = escapeHtml;
  const c = EMAIL_PALETTE.light;
  const font = 'font-family:Arial,Helvetica,sans-serif';
  // Invoice-style row: concept on the left, value on the right; long values wrap inside their own column (fixed layout, no overflow).
  const row = (label: string, value?: string | number | null, strong = false) => value === undefined || value === null || value === '' ? ''
    : `<tr><td class="em-muted em-line" valign="top" style="width:46%;padding:${strong ? '12px' : '9px'} 12px ${strong ? '12px' : '9px'} 0;border-bottom:1px solid ${c.line};color:${c.muted};${font};font-size:${strong ? '15px' : '13px'};line-height:1.45;${strong ? 'font-weight:700;' : ''}">${e(label)}</td><td class="em-text em-line" align="right" valign="top" style="width:54%;padding:${strong ? '12px' : '9px'} 0;border-bottom:1px solid ${c.line};color:${c.text};${font};font-size:${strong ? '17px' : '14px'};line-height:1.45;font-weight:700;text-align:right;word-break:break-word;overflow-wrap:anywhere">${e(String(value))}</td></tr>`;
  const rows = (body: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;border-top:1px solid ${c.line}" class="em-line">${body}</table>`;
  const section = (title: string, body: string) => `<tr><td class="em-card em-pad" bgcolor="${c.card}" style="padding:0 30px 20px;background-color:${c.card}"><h2 class="em-text" style="margin:8px 0 8px;color:${c.text};${font};font-size:17px;line-height:1.3">${e(title)}</h2>${body}</td></tr>`;
  const contactBlock = input.contact ? section(es ? 'Datos del cliente' : 'Customer details', rows(`${row(es ? 'Nombre' : 'Name', input.name)}${row('Email', input.contact.email)}${row('WhatsApp', input.contact.whatsapp)}`)) : '';
  // "Arrive 15 minutes early / contact us" is instructions for the traveler, not the business reading its own admin alert — only shown when
  // there is no contact block (i.e. the customer-facing variant). The concrete recommended time is in the date block above.
  const infoBlock = input.contact ? '' : `<tr><td class="em-card em-pad" bgcolor="${c.card}" style="padding:0 30px 20px;background-color:${c.card}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-note" bgcolor="${c.note}" style="background-color:${c.note};border-radius:12px"><tr><td class="em-note" bgcolor="${c.note}" style="padding:18px 20px;background-color:${c.note};border-radius:12px"><h2 class="em-text" style="margin:0 0 8px;color:${c.text};${font};font-size:16px">${es ? 'Información importante' : 'Important information'}</h2><p class="em-muted" style="margin:0;color:${c.muted};${font};font-size:14px;line-height:1.6">${es ? 'Llega al punto de salida al menos 15 minutos antes de la hora programada.' : 'Please arrive at the departure location at least 15 minutes before the scheduled departure time.'}<br><br>${es ? 'Si tienes preguntas o necesitas hacer cambios, contáctanos con anticipación.' : 'If you need to make changes to your reservation, contact us in advance.'}</p></td></tr></table></td></tr>`;
  const defaultHeading = es ? 'Pago recibido y reserva confirmada' : 'Payment received and booking confirmed';
  const defaultIntro = es ? 'Tu pago fue recibido correctamente.<br>Muchas gracias por reservar con Papagayo Fishing Tours.' : 'Your payment was received successfully.<br>Thank you very much for booking with Papagayo Fishing Tours.';
  // Reference + date block: two fluid columns (side by side on wide screens, stacked on a phone) WITHOUT depending on media queries — each column
  // is an inline-block that wraps when the row is narrower than two columns. Outlook desktop gets a classic two-cell table through the MSO ghost.
  const column = (label: string, value: string, extra = '') => `<div class="em-col" style="display:inline-block;width:100%;max-width:262px;vertical-align:top"><div style="padding:14px 16px"><div class="em-muted" style="color:${c.muted};${font};font-size:12px;line-height:1.4">${e(label)}</div><div class="em-text" style="margin-top:4px;color:${c.text};${font};font-size:16px;font-weight:700;line-height:1.35;word-break:break-word">${e(value)}</div>${extra}</div></div>`;
  const timeLines = `${input.time ? `<div class="em-text" style="margin-top:6px;color:${c.text};${font};font-size:14px;line-height:1.45">${es ? 'Hora de salida' : 'Departure Time'}: ${e(input.time)}</div>` : ''}${input.arrival ? `<div class="em-text" style="margin-top:4px;color:${c.text};${font};font-size:14px;line-height:1.45">${es ? 'Llegada recomendada' : 'Recommended arrival'}: <strong>${e(input.arrival)}</strong></div>` : ''}`;
  const dateBlock = `<tr><td class="em-card em-pad" bgcolor="${c.card}" style="padding:0 30px 20px;background-color:${c.card}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-box" bgcolor="${c.box}" style="background-color:${c.box};border-radius:12px"><tr><td class="em-box" bgcolor="${c.box}" align="center" style="padding:6px 4px;background-color:${c.box};border-radius:12px;font-size:0;line-height:0;text-align:center"><!--[if mso]><table role="presentation" width="100%"><tr><td width="50%" valign="top"><![endif]-->${column(es ? 'Referencia de reserva' : 'Booking reference', input.reference)}<!--[if mso]></td><td width="50%" valign="top"><![endif]-->${column(es ? 'Fecha del tour' : 'Tour date', input.date, timeLines)}<!--[if mso]></td></tr></table><![endif]--></td></tr></table></td></tr>`;
  const details = section(es ? 'Detalles de la reserva' : 'Booking details', rows(`${row('Tour', input.tour)}${row(es ? 'Bote' : 'Boat', input.boat)}${row(es ? 'Paquete' : 'Package', input.packageName)}${row(es ? 'Personas' : 'Guests', input.guests)}${row(es ? 'Punto de encuentro' : 'Departure location', input.departureLocation)}${row(es ? 'Solicitudes especiales' : 'Special requests', input.specialRequests)}`));
  const payment = section(es ? 'Resumen del pago' : 'Payment summary', rows(`${row(es ? 'Precio del paquete' : 'Package subtotal', input.basePrice)}${row(es ? 'Personas adicionales' : 'Additional guests', input.extraGuestsTotal)}${row('Extras', input.extrasTotal)}${row(es ? 'Cargo por salida' : 'Departure surcharge', input.departureSurcharge)}${row('Subtotal', input.subtotal)}${row(`IVA (${Math.round((input.taxRate ?? 0) * 100)}%)`, input.taxAmount)}${row('Total', input.total, true)}${row(es ? 'Estado del pago' : 'Payment status', input.paymentStatus)}`));
  return `<!doctype html><html lang="${input.language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>Papagayo Fishing Tours</title><style>${emailHeadStyles()}</style></head><body class="em-page" bgcolor="${c.page}" style="margin:0;padding:0;background-color:${c.page};color:${c.text};${font}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-page" bgcolor="${c.page}" style="background-color:${c.page}"><tr><td align="center" class="em-page" bgcolor="${c.page}" style="padding:24px 12px;background-color:${c.page}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-card" bgcolor="${c.card}" style="max-width:620px;background-color:${c.card};border-radius:16px;overflow:hidden"><tr><td class="em-head" align="center" bgcolor="${c.head}" style="background-color:${c.head};background-image:linear-gradient(${c.head},${c.head});padding:28px 20px"><img src="https://www.papagayofishingtourcr.com/images/papagayo-logo.png" width="260" alt="Papagayo Fishing Tours" style="display:block;width:260px;max-width:90%;height:auto;border:0"></td></tr><tr><td class="em-card em-pad" bgcolor="${c.card}" style="padding:34px 30px 20px;background-color:${c.card}"><h1 class="em-text" style="margin:0 0 12px;text-align:center;color:${c.text};${font};font-size:26px;line-height:1.25">${e(input.heading ?? defaultHeading)}</h1><p class="em-muted" style="margin:0;text-align:center;color:${c.muted};${font};font-size:15px;line-height:1.6">${input.introduction ? e(input.introduction) : defaultIntro}</p>${input.contact ? '' : `<p class="em-text" style="margin:22px 0 0;color:${c.text};${font};font-size:16px">${es ? 'Hola' : 'Hi'} ${e(input.name)},</p>`}</td></tr>${dateBlock}${contactBlock}${details}${payment}${infoBlock}<tr><td class="em-card em-pad" align="center" bgcolor="${c.card}" style="padding:4px 30px 28px;background-color:${c.card}"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${c.cta}" style="background-color:${c.cta};border-radius:8px"><a href="https://wa.me/${e(input.whatsappNumber)}" style="display:inline-block;background-color:${c.cta};color:${c.ctaText};text-decoration:none;border-radius:8px;padding:14px 24px;${font};font-size:15px;font-weight:700">${e(input.ctaLabel ?? (es ? 'Contáctanos por WhatsApp' : 'Contact us on WhatsApp'))}</a></td></tr></table></td></tr><tr><td class="em-card em-pad em-muted" bgcolor="${c.card}" style="padding:0 30px 28px;background-color:${c.card};color:${c.muted};${font};font-size:14px;line-height:1.6">${es ? 'Estamos listos para ofrecerte una experiencia increíble.' : "We're ready to give you an amazing experience."}<br><br>Pura Vida,<br><strong class="em-text" style="color:${c.text}">Papagayo Fishing Tours</strong></td></tr>${input.termsVersion ? termsFooterHtml(input.termsVersion, input.language) : ''}<tr><td class="em-foot em-foottext" align="center" bgcolor="${c.foot}" style="background-color:${c.foot};padding:18px;color:${c.footText};${font};font-size:12px;line-height:1.6">Papagayo Fishing Tours<br>Costa Rica<br><a class="em-foottext" href="https://papagayofishingtourcr.com" style="color:${c.footText}">papagayofishingtourcr.com</a></td></tr></table></td></tr></table></body></html>`;
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character); }
function formatEmailUsd(value: number) { return '$' + value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }); }
function formatDate(value: string, language: Language) { const date = new Date(`${value}T00:00:00Z`); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(language === 'es' ? 'es-CR' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }

export function formatDepartureTime(value?: string | null): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value ?? '');
  if (!match) return '';
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function bookingEmailAmounts(booking: any) {
  return {
    basePrice: formatEmailUsd(Number(booking.base_price_snapshot ?? 0)),
    subtotal: formatEmailUsd(Number(booking.subtotal_snapshot ?? 0)),
    taxAmount: formatEmailUsd(Number(booking.tax_amount_snapshot ?? 0)),
    taxRate: Number(booking.tax_rate_snapshot ?? 0),
    extraGuestsTotal: Number(booking.extra_guests_total_snapshot) > 0 ? formatEmailUsd(Number(booking.extra_guests_total_snapshot)) : undefined,
    extrasTotal: Number(booking.extras_total_snapshot) > 0 ? formatEmailUsd(Number(booking.extras_total_snapshot)) : undefined,
    departureSurcharge: Number(booking.departure_surcharge_snapshot) > 0 ? formatEmailUsd(Number(booking.departure_surcharge_snapshot)) : undefined,
  };
}
function bookingPriceLines(booking: any, es: boolean) {
  return [`${es ? 'Precio del paquete' : 'Package subtotal'}: ${formatEmailUsd(Number(booking.base_price_snapshot ?? 0))}`,
    ...(Number(booking.extra_guests_total_snapshot) > 0 ? [`${es ? 'Personas adicionales' : 'Additional guests'}: ${formatEmailUsd(Number(booking.extra_guests_total_snapshot))}`] : []),
    ...(Number(booking.extras_total_snapshot) > 0 ? [`Extras: ${formatEmailUsd(Number(booking.extras_total_snapshot))}`] : []),
    ...(Number(booking.departure_surcharge_snapshot) > 0 ? [`${es ? 'Cargo por salida' : 'Departure surcharge'}: ${formatEmailUsd(Number(booking.departure_surcharge_snapshot))}`] : []),
    `Subtotal: ${formatEmailUsd(Number(booking.subtotal_snapshot ?? 0))}`,
    `IVA (${Math.round(Number(booking.tax_rate_snapshot ?? 0) * 100)}%): ${formatEmailUsd(Number(booking.tax_amount_snapshot ?? 0))}`];
}

/** The exact policies of the version the customer accepted: small, secondary but legible, below the CTA, behind a subtle divider (not a card). */
function termsFooterHtml(version: string, language: Language) {
  const terms = getTerms(version, language);
  const e = escapeHtml;
  const c = EMAIL_PALETTE.light;
  const font = 'font-family:Arial,Helvetica,sans-serif';
  const heading = language === 'es' ? 'Términos y Condiciones' : 'Terms and Conditions';
  const sections = terms.sections.map((entry) => `<h3 class="em-text" style="margin:14px 0 4px;color:${c.text};${font};font-size:12px;line-height:1.4;font-weight:700">${e(entry.title)}</h3><ul class="em-muted" style="margin:0;padding-left:18px;color:${c.muted};${font};font-size:11px;line-height:1.55">${entry.items.map((item) => `<li style="margin:0 0 3px;color:${c.muted}" class="em-muted">${e(item)}</li>`).join('')}</ul>`).join('');
  return `<tr><td class="em-card em-pad" bgcolor="${c.card}" style="padding:0 30px 26px;background-color:${c.card}"><div class="em-line" style="border-top:1px solid ${c.line};padding-top:18px"><p class="em-text" style="margin:0;color:${c.text};${font};font-size:12px;font-weight:700;line-height:1.4">${e(heading)}</p>${sections}</div></td></tr>`;
}

/** Departure time minus 15 minutes, from the real time slot (never hard-coded). 12:00 AM -> "11:45 PM (previous day)". '' when the time is unknown. */
export const RECOMMENDED_ARRIVAL_MINUTES = 15;
export function formatRecommendedArrival(value: string | null | undefined, language: Language): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value ?? '');
  if (!match) return '';
  const departure = Number(match[1]) * 60 + Number(match[2]);
  const arrival = departure - RECOMMENDED_ARRIVAL_MINUTES;
  const previousDay = arrival < 0;
  const minutes = (arrival + 24 * 60) % (24 * 60);
  const label = formatDepartureTime(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
  return previousDay ? `${label} (${language === 'es' ? 'día anterior' : 'previous day'})` : label;
}

/** The plain-text summary lines of a booking. `operational` adds the customer-only lines (recommended arrival, special requests). */
function bookingSummaryLines(booking: any, language: Language, ctx: { dateLabel: string; timeLabel: string; paymentLabel: string; operational: boolean }) {
  const es = language === 'es';
  const arrival = ctx.operational ? formatRecommendedArrival(booking.time_slots?.starts_at, language) : '';
  const specialRequests = ctx.operational ? String(booking.special_requests ?? '').trim() : '';
  return [
    `${es ? 'Reserva' : 'Reservation'}: ${booking.booking_reference}`,
    `${es ? 'Cliente' : 'Customer'}: ${booking.customers.full_name}`,
    `${es ? 'Correo' : 'Email'}: ${booking.customers.email}`,
    `WhatsApp: ${booking.customers.whatsapp}`,
    `${es ? 'Bote' : 'Boat'}: ${booking.boats?.name ?? '-'}`,
    `Tour: ${booking.tours?.title ?? '-'}`,
    `${es ? 'Paquete' : 'Package'}: ${booking.tour_packages?.name || '-'}`,
    `${es ? 'Fecha' : 'Date'}: ${ctx.dateLabel}`,
    ...(ctx.timeLabel ? [`${es ? 'Hora de salida' : 'Departure Time'}: ${ctx.timeLabel}`] : []),
    ...(arrival ? [`${es ? 'Llegada recomendada' : 'Recommended arrival'}: ${arrival}`] : []),
    `${es ? 'Personas' : 'Guests'}: ${booking.guests}`,
    `${es ? 'Punto de encuentro' : 'Departure location'}: ${booking.departure_location_name_snapshot ?? '-'}`,
    ...(specialRequests ? [`${es ? 'Solicitudes especiales' : 'Special requests'}: ${specialRequests}`] : []),
    ...bookingPriceLines(booking, es),
    `Total: ${formatEmailUsd(Number(booking.total_snapshot ?? 0))}`,
    `${es ? 'Estado del pago' : 'Payment status'}: ${ctx.paymentLabel}`,
  ];
}

export async function buildBookingRequestSummary(supabase: SupabaseClient, bookingId: string, language: Language): Promise<string> {
  const booking = await fetchBookingForEmail(supabase, bookingId);
  const es = language === 'es';
  const time = formatDepartureTime(booking.time_slots?.starts_at);
  return [
    `${es ? 'Reserva' : 'Reservation'}: ${booking.booking_reference}`,
    `${es ? 'Cliente' : 'Customer'}: ${booking.customers?.full_name ?? ''}`,
    `Email: ${booking.customers?.email ?? ''}`,
    `WhatsApp: ${booking.customers?.whatsapp ?? ''}`,
    `${es ? 'Bote' : 'Boat'}: ${booking.boats?.name ?? ''}`,
    `Tour: ${booking.tours?.title ?? ''}`,
    `${es ? 'Paquete' : 'Package'}: ${booking.tour_packages?.name ?? ''}`,
    `${es ? 'Fecha' : 'Tour Date'}: ${formatDate(booking.tour_date, language)}`,
    ...(time ? [`${es ? 'Hora de salida' : 'Departure Time'}: ${time}`] : []),
    `${es ? 'Personas' : 'Guests'}: ${booking.guests}`,
    `${es ? 'Lugar de salida' : 'Departure location'}: ${booking.departure_location_name_snapshot ?? '-'}`,
    ...bookingPriceLines(booking, es),
    `Total: ${formatEmailUsd(Number(booking.total_snapshot ?? 0))}`,
  ].join('\n');
}
