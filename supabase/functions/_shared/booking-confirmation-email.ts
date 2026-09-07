import { createClient } from 'npm:@supabase/supabase-js@2';

type SupabaseClient = ReturnType<typeof createClient>;

type ConfirmationMessage = {
  to: string;
  subject: string;
  text: string;
  dedupe: string;
};

/**
 * Persists and enqueues the post-payment confirmation without contacting the
 * email provider. The database unique constraint makes this idempotent across
 * PayPal capture/webhook retries and future confirmation callers.
 */
export async function enqueueBookingConfirmationEmails(supabase: SupabaseClient, bookingId: string) {
  const messages = await getBookingConfirmationMessages(supabase, bookingId);
  if (!messages.length) return;

  const { error } = await supabase.rpc('enqueue_booking_confirmation_emails', {
    p_booking_id: bookingId,
    p_messages: messages,
  });
  if (error) throw error;
}

export async function refreshBookingConfirmationNotification(
  supabase: SupabaseClient,
  notificationId: string,
) {
  const { data: notification, error: notificationError } = await supabase
    .from('booking_notifications')
    .select('id, booking_id, dedupe_key, sent_at')
    .eq('id', notificationId)
    .single();
  if (notificationError) throw notificationError;
  if (notification.sent_at) return null;

  const messages = await getBookingConfirmationMessages(supabase, notification.booking_id);
  const message = messages.find((candidate) => candidate.dedupe === notification.dedupe_key);
  if (!message) return null;

  const { error: updateError } = await supabase
    .from('booking_notifications')
    .update({ payload: { to: message.to, subject: message.subject, text: message.text } })
    .eq('id', notification.id)
    .is('sent_at', null);
  if (updateError) throw updateError;
  return message;
}

async function getBookingConfirmationMessages(supabase: SupabaseClient, bookingId: string) {
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select(`
      id,
      booking_reference,
      payment_method_key,
      payment_status,
      tour_date,
      guests,
      total_snapshot,
      departure_location_name_snapshot,
      departure_surcharge_snapshot,
      customers(full_name, email, whatsapp),
      boats(name),
      tours(title),
      time_slots(label)
    `)
    .eq('id', bookingId)
    .single();

  if (bookingError) throw bookingError;
  if (!booking?.customers?.email) return [] as ConfirmationMessage[];

  const adminEmail = Deno.env.get('BOOKING_ADMIN_EMAIL');
  const paymentConfirmed = booking.payment_status === 'paid';
  const summary = [
    `Reserva: ${booking.booking_reference}`,
    `Cliente: ${booking.customers.full_name}`,
    `Email: ${booking.customers.email}`,
    `WhatsApp: ${booking.customers.whatsapp}`,
    `Bote: ${booking.boats?.name ?? '-'}`,
    `Tour: ${booking.tours?.title ?? '-'}`,
    `Fecha: ${booking.tour_date}`,
    `Hora: ${booking.time_slots?.label ?? '-'}`,
    `Personas: ${booking.guests}`,
    `Lugar de salida: ${booking.departure_location_name_snapshot ?? '-'}`,
    `Cargo salida: ${formatUsd(Number(booking.departure_surcharge_snapshot ?? 0))}`,
    `${paymentConfirmed ? 'Total pagado' : 'Total de reserva'}: ${formatUsd(Number(booking.total_snapshot ?? 0))}`,
  ].join('\n');

  const messages = [
    {
      to: booking.customers.email,
      subject: `Reserva confirmada ${booking.booking_reference}`,
      text: `Hola ${booking.customers.full_name},\n\n${paymentConfirmed ? 'Tu pago fue confirmado y tu reserva queda confirmada.' : 'Tu reserva fue confirmada. Nuestro equipo te contactará para coordinar el pago pendiente.'}\n\n${summary}\n\nPapagayo Fishing Tours`,
      dedupe: `booking:${booking.id}:paypal-confirmation-customer-email`,
    },
    adminEmail ? {
      to: adminEmail,
      subject: `${paymentConfirmed ? 'Pago confirmado' : 'Reserva confirmada'} ${booking.booking_reference}`,
      text: `${paymentConfirmed ? `Pago ${booking.payment_method_key === 'paypal' ? 'PayPal ' : ''}confirmado.` : 'Reserva confirmada desde el panel administrativo.'}\n\n${summary}`,
      dedupe: `booking:${booking.id}:paypal-confirmation-admin-email`,
    } : null,
  ].filter(Boolean) as ConfirmationMessage[];

  return messages;
}

function formatUsd(value: number) {
  return `USD ${value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;
}
