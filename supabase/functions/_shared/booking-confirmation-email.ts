import { createClient } from 'npm:@supabase/supabase-js@2';

type SupabaseClient = ReturnType<typeof createClient>;
type ConfirmationMessage = { to: string; subject: string; text: string; html: string; dedupe: string };

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
  const { data: booking, error } = await supabase.from('bookings').select(`id, booking_reference, payment_method_key, payment_status, tour_date, guests, total_snapshot, departure_location_name_snapshot, departure_surcharge_snapshot, customers(full_name, email, whatsapp), boats(name), tours(title), tour_packages(name), time_slots(label)`).eq('id', bookingId).single();
  if (error) throw error;
  if (!booking?.customers?.email) return [];
  const adminEmail = Deno.env.get('BOOKING_ADMIN_EMAIL');
  const { data: whatsappSetting } = await supabase.from('site_settings').select('value').eq('key', 'whatsapp_number').eq('active', true).maybeSingle();
  const whatsappNumber = String(whatsappSetting?.value ?? '50686105784').replace(/\D/g, '');
  const paid = booking.payment_status === 'paid';
  const dateLabel = formatDate(booking.tour_date);
  const timeLabel = booking.time_slots?.label ?? '';
  const packageName = booking.tour_packages?.name ?? '';
  const summary = [`Reservation: ${booking.booking_reference}`, `Customer: ${booking.customers.full_name}`, `Email: ${booking.customers.email}`, `WhatsApp: ${booking.customers.whatsapp}`, `Boat: ${booking.boats?.name ?? '-'}`, `Tour: ${booking.tours?.title ?? '-'}`, `Package: ${packageName || '-'}`, `Date: ${dateLabel}`, `Time: ${timeLabel || '-'}`, `Guests: ${booking.guests}`, `Departure: ${booking.departure_location_name_snapshot ?? '-'}`, `Departure surcharge: ${formatUsd(Number(booking.departure_surcharge_snapshot ?? 0))}`, `Total: ${formatUsd(Number(booking.total_snapshot ?? 0))}`, `Payment status: ${paid ? 'Paid' : 'Pending'}`].join('\n');
  const customerText = `Hola ${booking.customers.full_name},\n\nTu pago de PayPal fue recibido correctamente. En unos momentos recibirás la confirmación de tu reserva. Muchas gracias por reservar con Papagayo Fishing Tours.\n\n${summary}\n\nLlega a la marina 15 minutos antes de la salida.\n\nWhatsApp: https://wa.me/${whatsappNumber}\n\nPura Vida,\nPapagayo Fishing Tours`;
  const messages: ConfirmationMessage[] = [{ to: booking.customers.email, subject: `Pago recibido y reserva confirmada - ${booking.booking_reference}`, text: customerText, html: buildCustomerHtml({ name: booking.customers.full_name, reference: booking.booking_reference, date: dateLabel, time: timeLabel, tour: booking.tours?.title, boat: booking.boats?.name, packageName, guests: booking.guests, total: formatUsd(Number(booking.total_snapshot ?? 0)), paymentStatus: paid ? 'Paid' : 'Pending', whatsappNumber }), dedupe: `booking:${booking.id}:paypal-confirmation-customer-email` }];
  if (adminEmail) messages.push({ to: adminEmail, subject: `${paid ? 'Payment confirmed' : 'Booking confirmed'} ${booking.booking_reference}`, text: `${paid ? 'Payment confirmed.' : 'Booking confirmed from admin panel.'}\n\n${summary}`, html: `<pre style="font:14px/1.5 Arial,sans-serif;white-space:pre-wrap">${escapeHtml(`${paid ? 'Payment confirmed.' : 'Booking confirmed from admin panel.'}\n\n${summary}`)}</pre>`, dedupe: `booking:${booking.id}:paypal-confirmation-admin-email` });
  return messages;
}

function buildCustomerHtml(input: { name: string; reference: string; date: string; time: string; tour?: string | null; boat?: string | null; packageName?: string | null; guests: number; total: string; paymentStatus: string; whatsappNumber: string }) {
  const e = escapeHtml;
  const row = (label: string, value?: string | number | null) => value === undefined || value === null || value === '' ? '' : `<tr><td style="padding:8px 0;color:#64748b;font-size:13px;width:38%">${e(label)}</td><td style="padding:8px 0;color:#0f2742;font-size:14px;font-weight:700">${e(String(value))}</td></tr>`;
  return `<!doctype html><html><body style="margin:0;background:#f1f6f8;color:#0f2742;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f6f8"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border-radius:16px;overflow:hidden"><tr><td align="center" style="background:#082c4c;padding:28px 20px"><img src="https://papagayofishingtours.com/images/papagayo-logo.png" width="260" alt="Papagayo Fishing Tours" style="display:block;width:260px;max-width:90%;height:auto;border:0"></td></tr><tr><td style="padding:34px 30px 16px"><div style="color:#159a72;font-size:28px;font-weight:700;text-align:center">✓</div><h1 style="margin:8px 0 12px;text-align:center;color:#0f2742;font-size:26px">Reservation Confirmed</h1><p style="margin:0;text-align:center;color:#475569;font-size:15px;line-height:1.6">Thank you for choosing Papagayo Fishing Tours.<br>We're excited to have you on board!</p><p style="margin:22px 0 0;color:#0f2742;font-size:16px">Hi ${e(input.name)},</p></td></tr><tr><td style="padding:0 30px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eaf4f8;border-radius:12px"><tr><td style="padding:18px 20px;width:50%;vertical-align:top"><div style="color:#64748b;font-size:12px">Reservation #</div><div style="margin-top:5px;color:#0f2742;font-size:17px;font-weight:700">${e(input.reference)}</div></td><td style="padding:18px 20px;width:50%;vertical-align:top"><div style="color:#64748b;font-size:12px">Tour Date</div><div style="margin-top:5px;color:#0f2742;font-size:15px;font-weight:700">${e(input.date)}</div><div style="margin-top:4px;color:#0f2742;font-size:14px">${e(input.time || '-')}</div></td></tr></table></td></tr><tr><td style="padding:0 30px 18px"><h2 style="margin:8px 0 10px;color:#0f2742;font-size:17px">Reservation Details</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0">${row('Tour', input.tour)}${row('Boat', input.boat)}${row('Package', input.packageName)}${row('Guests', input.guests)}</table></td></tr><tr><td style="padding:0 30px 18px"><h2 style="margin:8px 0 10px;color:#0f2742;font-size:17px">Payment Summary</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0">${row('Total', input.total)}${row('Payment Status', input.paymentStatus)}</table></td></tr><tr><td style="padding:0 30px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f8f6;border-radius:12px"><tr><td style="padding:18px 20px"><h2 style="margin:0 0 8px;color:#0f2742;font-size:16px">Important Information</h2><p style="margin:0;color:#475569;font-size:14px;line-height:1.6">Please arrive at the marina 15 minutes before departure.<br><br>If you have any questions or need to make changes, feel free to contact us.</p></td></tr></table></td></tr><tr><td align="center" style="padding:4px 30px 28px"><a href="https://wa.me/${e(input.whatsappNumber)}" style="display:inline-block;background:#159a72;color:#fff;text-decoration:none;border-radius:8px;padding:14px 24px;font-size:15px;font-weight:700">Contact us on WhatsApp</a></td></tr><tr><td style="padding:0 30px 28px;color:#475569;font-size:14px;line-height:1.6">We look forward to providing you with an amazing experience!<br><br>Pura Vida,<br><strong style="color:#0f2742">Papagayo Fishing Tours</strong></td></tr><tr><td align="center" style="background:#082c4c;padding:18px;color:#dbeafe;font-size:12px;line-height:1.6">Papagayo Fishing Tours<br>Costa Rica<br><a href="https://papagayofishingtourcr.com" style="color:#dbeafe">papagayofishingtourcr.com</a></td></tr></table></td></tr></table></body></html>`;
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character); }
function formatUsd(value: number) { return `USD ${value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`; }
function formatDate(value: string) { const date = new Date(`${value}T00:00:00Z`); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }
