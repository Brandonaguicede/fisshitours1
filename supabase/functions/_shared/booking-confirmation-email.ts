import { createClient } from 'npm:@supabase/supabase-js@2';

type SupabaseClient = ReturnType<typeof createClient>;
type ConfirmationMessage = { to: string; subject: string; text: string; html: string; dedupe: string };
type Language = 'es' | 'en';

// `bookings` has no persisted language/locale column — a public booking's
// real-time request (create-booking) DOES know the customer's language and
// threads it through explicitly, but this path (payment captured later via
// PayPal webhook, or an admin confirming days after the fact) has no way to
// recover it without that column. Defaults to
// 'es' — the business's own operating language and this file's original,
// unconditional behavior — so nothing changes until a caller actually knows
// better.
const DEFAULT_LANGUAGE: Language = 'es';

export async function enqueueBookingConfirmationEmails(supabase: SupabaseClient, bookingId: string, language: Language = DEFAULT_LANGUAGE) {
  const messages = await getBookingConfirmationMessages(supabase, bookingId, language);
  if (!messages.length) return;
  const { error } = await supabase.rpc('enqueue_booking_confirmation_emails', { p_booking_id: bookingId, p_messages: messages });
  if (error) throw error;
}

export async function refreshBookingConfirmationNotification(supabase: SupabaseClient, notificationId: string, language: Language = DEFAULT_LANGUAGE) {
  const { data: notification, error } = await supabase.from('booking_notifications').select('id, booking_id, dedupe_key, sent_at').eq('id', notificationId).single();
  if (error) throw error;
  if (notification.sent_at) return null;
  const messages = await getBookingConfirmationMessages(supabase, notification.booking_id, language);
  const message = messages.find((candidate) => candidate.dedupe === notification.dedupe_key);
  if (!message) return null;
  const { error: updateError } = await supabase.from('booking_notifications').update({ payload: { to: message.to, subject: message.subject, text: message.text, html: message.html } }).eq('id', notification.id).is('sent_at', null);
  if (updateError) throw updateError;
  return message;
}

async function getBookingConfirmationMessages(supabase: SupabaseClient, bookingId: string, language: Language): Promise<ConfirmationMessage[]> {
  const es = language === 'es';
  const { data: booking, error } = await supabase.from('bookings').select(`id, booking_reference, payment_method_key, payment_status, tour_date, guests, total_snapshot, departure_location_name_snapshot, departure_surcharge_snapshot, customers(full_name, email, whatsapp), boats(name), tours(title), tour_packages(name), time_slots(label)`).eq('id', bookingId).single();
  if (error) throw error;
  if (!booking?.customers?.email) return [];
  const adminEmail = Deno.env.get('BOOKING_ADMIN_EMAIL');
  const { data: whatsappSetting } = await supabase.from('site_settings').select('value').eq('key', 'whatsapp_number').eq('active', true).maybeSingle();
  const whatsappNumber = String(whatsappSetting?.value ?? '50686105784').replace(/\D/g, '');
  const paid = booking.payment_status === 'paid';
  const dateLabel = formatDate(booking.tour_date, language);
  const timeLabel = booking.time_slots?.label ?? '';
  const packageName = booking.tour_packages?.name ?? '';
  const paidLabel = es ? (paid ? 'Pagado' : 'Pendiente') : (paid ? 'Paid' : 'Pending');
  const summary = es
    ? [`Reserva: ${booking.booking_reference}`, `Cliente: ${booking.customers.full_name}`, `Correo: ${booking.customers.email}`, `WhatsApp: ${booking.customers.whatsapp}`, `Bote: ${booking.boats?.name ?? '-'}`, `Tour: ${booking.tours?.title ?? '-'}`, `Paquete: ${packageName || '-'}`, `Fecha: ${dateLabel}`, `Hora: ${timeLabel || '-'}`, `Personas: ${booking.guests}`, `Lugar de salida: ${booking.departure_location_name_snapshot ?? '-'}`, `Cargo por salida: ${formatUsd(Number(booking.departure_surcharge_snapshot ?? 0))}`, `Total: ${formatUsd(Number(booking.total_snapshot ?? 0))}`, `Estado del pago: ${paidLabel}`].join('\n')
    : [`Reservation: ${booking.booking_reference}`, `Customer: ${booking.customers.full_name}`, `Email: ${booking.customers.email}`, `WhatsApp: ${booking.customers.whatsapp}`, `Boat: ${booking.boats?.name ?? '-'}`, `Tour: ${booking.tours?.title ?? '-'}`, `Package: ${packageName || '-'}`, `Date: ${dateLabel}`, `Time: ${timeLabel || '-'}`, `Guests: ${booking.guests}`, `Departure: ${booking.departure_location_name_snapshot ?? '-'}`, `Departure surcharge: ${formatUsd(Number(booking.departure_surcharge_snapshot ?? 0))}`, `Total: ${formatUsd(Number(booking.total_snapshot ?? 0))}`, `Payment status: ${paidLabel}`].join('\n');
  const meetingPointText = booking.departure_location_name_snapshot?.trim() || (es ? 'el punto de encuentro' : 'the meeting point');
  const customerText = es
    ? `Hola ${booking.customers.full_name},\n\n${paid ? (booking.payment_method_key === 'paypal' ? 'Tu pago de PayPal fue recibido correctamente.' : 'Tu pago fue recibido correctamente.') : 'Tu reserva esta confirmada y el pago queda pendiente.'} ${paid ? 'Tu reserva esta confirmada.' : ''} Muchas gracias por reservar con Papagayo Fishing Tours.\n\n${summary}\n\nLlega a ${meetingPointText} 15 minutos antes de la salida.\n\nWhatsApp: https://wa.me/${whatsappNumber}\n\nPura Vida,\nPapagayo Fishing Tours`
    : `Hi ${booking.customers.full_name},\n\n${paid ? (booking.payment_method_key === 'paypal' ? 'Your PayPal payment was received successfully.' : 'Your payment was received successfully.') : 'Your booking is confirmed and payment is still pending.'} ${paid ? 'Your booking is confirmed.' : ''} Thank you very much for booking with Papagayo Fishing Tours.\n\n${summary}\n\nPlease arrive at ${meetingPointText} 15 minutes before departure.\n\nWhatsApp: https://wa.me/${whatsappNumber}\n\nPura Vida,\nPapagayo Fishing Tours`;
  const messages: ConfirmationMessage[] = [{
    to: booking.customers.email,
    subject: es ? `Pago recibido y reserva confirmada - ${booking.booking_reference}` : `Payment received and booking confirmed - ${booking.booking_reference}`,
    text: customerText,
    html: buildBookingHtml({ name: booking.customers.full_name, reference: booking.booking_reference, date: dateLabel, time: timeLabel, tour: booking.tours?.title, boat: booking.boats?.name, packageName, guests: booking.guests, departureLocation: booking.departure_location_name_snapshot, total: formatUsd(Number(booking.total_snapshot ?? 0)), paymentStatus: paidLabel, whatsappNumber, language }),
    dedupe: `booking:${booking.id}:paypal-confirmation-customer-email`,
  }];
  if (adminEmail) {
    // Admin-facing — stays in the business's own operating language
    // (Spanish, same as the rest of the Admin UI) regardless of which
    // language the customer used, per the same rule that keeps internal
    // notifications fixed rather than following the visitor's toggle.
    const adminHeading = paid ? 'Pago confirmado' : 'Reserva confirmada desde el panel';
    const adminSummary = es ? summary : [`Reserva: ${booking.booking_reference}`, `Cliente: ${booking.customers.full_name}`, `Correo: ${booking.customers.email}`, `WhatsApp: ${booking.customers.whatsapp}`, `Bote: ${booking.boats?.name ?? '-'}`, `Tour: ${booking.tours?.title ?? '-'}`, `Paquete: ${packageName || '-'}`, `Fecha: ${dateLabel}`, `Hora: ${timeLabel || '-'}`, `Personas: ${booking.guests}`, `Lugar de salida: ${booking.departure_location_name_snapshot ?? '-'}`, `Cargo por salida: ${formatUsd(Number(booking.departure_surcharge_snapshot ?? 0))}`, `Total: ${formatUsd(Number(booking.total_snapshot ?? 0))}`, `Estado del pago: ${paid ? 'Pagado' : 'Pendiente'}`].join('\n');
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
        total: formatUsd(Number(booking.total_snapshot ?? 0)),
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
    time: booking.time_slots?.label ?? '',
    tour: booking.tours?.title,
    boat: booking.boats?.name,
    packageName: booking.tour_packages?.name,
    guests: booking.guests,
    departureLocation: booking.departure_location_name_snapshot,
    total: formatUsd(Number(booking.total_snapshot ?? 0)),
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
    time: booking.time_slots?.label ?? '',
    tour: booking.tours?.title,
    boat: booking.boats?.name,
    packageName: booking.tour_packages?.name,
    guests: booking.guests,
    departureLocation: booking.departure_location_name_snapshot,
    total: formatUsd(Number(booking.total_snapshot ?? 0)),
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
    .select('booking_reference, tour_date, guests, total_snapshot, departure_location_name_snapshot, customers(full_name, email, whatsapp), boats(name), tours(title), tour_packages(name), time_slots(label)')
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

function buildBookingHtml(input: { name: string; reference: string; date: string; time: string; tour?: string | null; boat?: string | null; packageName?: string | null; guests: number; departureLocation?: string | null; total: string; paymentStatus: string; whatsappNumber: string; heading?: string; introduction?: string; contact?: { email: string; whatsapp: string } | null; ctaLabel?: string; language: Language }) {
  const es = input.language === 'es';
  const e = escapeHtml;
  const row = (label: string, value?: string | number | null) => value === undefined || value === null || value === '' ? '' : `<tr><td style="padding:8px 0;color:#64748b;font-size:13px;width:38%">${e(label)}</td><td style="padding:8px 0;color:#0f2742;font-size:14px;font-weight:700">${e(String(value))}</td></tr>`;
  const contactBlock = input.contact ? `<tr><td style="padding:0 30px 18px"><h2 style="margin:8px 0 10px;color:#0f2742;font-size:17px">${es ? 'Datos del cliente' : 'Customer details'}</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0">${row(es ? 'Nombre' : 'Name', input.name)}${row('Email', input.contact.email)}${row('WhatsApp', input.contact.whatsapp)}</table></td></tr>` : '';
  // Named specifically (whatever departure point the booking snapshot has —
  // a beach, a dock, a specific marina) instead of the generic "la marina",
  // which used to name the wrong meeting point whenever a tour actually
  // departs somewhere else and confused customers about where to show up.
  const meetingPoint = input.departureLocation?.trim() || (es ? 'el punto de encuentro' : 'the meeting point');
  // "Arrive 15 minutes early / contact us" is instructions for the traveler,
  // not the business reading its own admin alert — only show it when there's
  // no contact block (i.e. this is the customer-facing variant).
  const infoBlock = input.contact ? '' : `<tr><td style="padding:0 30px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f8f6;border-radius:12px"><tr><td style="padding:18px 20px"><h2 style="margin:0 0 8px;color:#0f2742;font-size:16px">${es ? 'Información importante' : 'Important information'}</h2><p style="margin:0;color:#475569;font-size:14px;line-height:1.6">${es ? `Llega a ${e(meetingPoint)} 15 minutos antes de la salida.` : `Please arrive at ${e(meetingPoint)} 15 minutes before departure.`}<br><br>${es ? 'Si tienes preguntas o necesitas hacer cambios, contáctanos.' : 'If you have questions or need to make changes, contact us.'}</p></td></tr></table></td></tr>`;
  const defaultHeading = es ? 'Pago recibido y reserva confirmada' : 'Payment received and booking confirmed';
  const defaultIntro = es ? 'Tu pago fue recibido correctamente.<br>Muchas gracias por reservar con Papagayo Fishing Tours.' : 'Your payment was received successfully.<br>Thank you very much for booking with Papagayo Fishing Tours.';
  return `<!doctype html><html><body style="margin:0;background:#f1f6f8;color:#0f2742;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f6f8"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border-radius:16px;overflow:hidden"><tr><td align="center" style="background:#082c4c;padding:28px 20px"><img src="https://www.papagayofishingtourcr.com/images/papagayo-logo.png" width="260" alt="Papagayo Fishing Tours" style="display:block;width:260px;max-width:90%;height:auto;border:0"></td></tr><tr><td style="padding:34px 30px 16px"><div style="color:#159a72;font-size:28px;font-weight:700;text-align:center">&#10003;</div><h1 style="margin:8px 0 12px;text-align:center;color:#0f2742;font-size:26px">${e(input.heading ?? defaultHeading)}</h1><p style="margin:0;text-align:center;color:#475569;font-size:15px;line-height:1.6">${input.introduction ? e(input.introduction) : defaultIntro}</p>${input.contact ? '' : `<p style="margin:22px 0 0;color:#0f2742;font-size:16px">${es ? 'Hola' : 'Hi'} ${e(input.name)},</p>`}</td></tr><tr><td style="padding:0 30px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eaf4f8;border-radius:12px"><tr><td style="padding:18px 20px;width:50%;vertical-align:top"><div style="color:#64748b;font-size:12px">${es ? 'Referencia de reserva' : 'Booking reference'}</div><div style="margin-top:5px;color:#0f2742;font-size:17px;font-weight:700">${e(input.reference)}</div></td><td style="padding:18px 20px;width:50%;vertical-align:top"><div style="color:#64748b;font-size:12px">${es ? 'Fecha del tour' : 'Tour date'}</div><div style="margin-top:5px;color:#0f2742;font-size:15px;font-weight:700">${e(input.date)}</div><div style="margin-top:4px;color:#0f2742;font-size:14px">${e(input.time || '-')}</div></td></tr></table></td></tr>${contactBlock}<tr><td style="padding:0 30px 18px"><h2 style="margin:8px 0 10px;color:#0f2742;font-size:17px">${es ? 'Detalles de la reserva' : 'Booking details'}</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0">${row(es ? 'Tour' : 'Tour', input.tour)}${row(es ? 'Bote' : 'Boat', input.boat)}${row(es ? 'Paquete' : 'Package', input.packageName)}${row(es ? 'Personas' : 'Guests', input.guests)}${row(es ? 'Punto de encuentro' : 'Meeting point', input.departureLocation)}</table></td></tr><tr><td style="padding:0 30px 18px"><h2 style="margin:8px 0 10px;color:#0f2742;font-size:17px">${es ? 'Resumen del pago' : 'Payment summary'}</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0">${row(es ? 'Total' : 'Total', input.total)}${row(es ? 'Estado del pago' : 'Payment status', input.paymentStatus)}</table></td></tr>${infoBlock}<tr><td align="center" style="padding:4px 30px 28px"><a href="https://wa.me/${e(input.whatsappNumber)}" style="display:inline-block;background:#159a72;color:#fff;text-decoration:none;border-radius:8px;padding:14px 24px;font-size:15px;font-weight:700">${e(input.ctaLabel ?? (es ? 'Contáctanos por WhatsApp' : 'Contact us on WhatsApp'))}</a></td></tr><tr><td style="padding:0 30px 28px;color:#475569;font-size:14px;line-height:1.6">${es ? 'Estamos listos para ofrecerte una experiencia increíble.' : "We're ready to give you an amazing experience."}<br><br>Pura Vida,<br><strong style="color:#0f2742">Papagayo Fishing Tours</strong></td></tr><tr><td align="center" style="background:#082c4c;padding:18px;color:#dbeafe;font-size:12px;line-height:1.6">Papagayo Fishing Tours<br>Costa Rica<br><a href="https://papagayofishingtourcr.com" style="color:#dbeafe">papagayofishingtourcr.com</a></td></tr></table></td></tr></table></body></html>`;
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character); }
function formatUsd(value: number) { return `USD ${value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`; }
function formatDate(value: string, language: Language) { const date = new Date(`${value}T00:00:00Z`); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(language === 'es' ? 'es-CR' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }
