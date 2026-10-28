import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Internal plain-text notice to the business mailbox (always Spanish), same channel and bookkeeping as the
// "Nueva solicitud de reserva" notice sent by create-booking: Resend + one booking_notifications row whose unique
// dedupe_key guarantees the notice is recorded (and sent) once.

export interface AdminBookingNotice {
  bookingId: string;
  subject: string;
  text: string;
  dedupe: string;
}

export async function sendAdminBookingNotice(supabase: SupabaseClient, notice: AdminBookingNotice): Promise<void> {
  const adminEmail = Deno.env.get('BOOKING_ADMIN_EMAIL');
  if (!adminEmail) return;
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('BOOKING_EMAIL_FROM');
  const replyTo = Deno.env.get('BOOKING_REPLY_TO')?.trim();

  // Claim the dedupe key first: a retry or a concurrent call cannot send the same notice twice.
  const { data: claimed, error } = await supabase.from('booking_notifications').insert({
    booking_id: notice.bookingId,
    type: 'email',
    channel: 'email',
    dedupe_key: notice.dedupe,
    payload: { to: adminEmail, subject: notice.subject, text: notice.text },
    sent_at: null,
  }).select('id').maybeSingle();
  if (error || !claimed) return;
  if (!apiKey || !from) return;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: adminEmail, subject: notice.subject, text: notice.text, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!response.ok) {
    console.error('Admin booking notice could not be sent', { bookingId: notice.bookingId, status: response.status });
    return;
  }
  await supabase.from('booking_notifications').update({ sent_at: new Date().toISOString() }).eq('id', claimed.id);
}
