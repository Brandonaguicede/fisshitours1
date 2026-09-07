import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { refreshBookingConfirmationNotification } from '../_shared/booking-confirmation-email.ts';

const MAX_MESSAGES_PER_RUN = 10;
const VISIBILITY_TIMEOUT_SECONDS = 120;

serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405 });

  try {
    const supabase = getSupabase();
    const apiKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('BOOKING_EMAIL_FROM');
    if (!apiKey || !from) return Response.json({ message: 'Email provider is not configured' }, { status: 500 });

    let processed = 0;
    let failed = 0;

    for (let index = 0; index < MAX_MESSAGES_PER_RUN; index += 1) {
      const { data: jobs, error: dequeueError } = await supabase.rpc('dequeue_booking_email', {
        p_visibility_timeout: VISIBILITY_TIMEOUT_SECONDS,
      });
      if (dequeueError) throw dequeueError;

      const job = jobs?.[0];
      if (!job) break;

      const notificationId = job.message?.notification_id;
      if (!notificationId) {
        await acknowledge(supabase, job.msg_id);
        continue;
      }

      const { data: notification, error: notificationError } = await supabase
        .from('booking_notifications')
        .select('id, payload, sent_at')
        .eq('id', notificationId)
        .single();
      if (notificationError || !notification) {
        console.error('Queued booking email notification not found', notificationError);
        await acknowledge(supabase, job.msg_id);
        continue;
      }

      if (notification.sent_at) {
        await acknowledge(supabase, job.msg_id);
        continue;
      }

      const message = await refreshBookingConfirmationNotification(supabase, notification.id);
      if (!message) {
        await acknowledge(supabase, job.msg_id);
        continue;
      }
      if (!message.to || !message.subject || !message.text) {
        console.error('Queued booking email has invalid payload', notification.id);
        await acknowledge(supabase, job.msg_id);
        continue;
      }

      const response = await sendEmail(apiKey, from, message, notification.id);
      if (!response.ok) {
        failed += 1;
        console.error('Queued booking email failed', notification.id, await response.text());
        continue;
      }

      const { error: updateError } = await supabase
        .from('booking_notifications')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', notification.id)
        .is('sent_at', null);
      if (updateError) {
        failed += 1;
        console.error('Queued booking email status update failed', notification.id, updateError);
        continue;
      }

      await acknowledge(supabase, job.msg_id);
      processed += 1;
    }

    return Response.json({ ok: failed === 0, processed, failed });
  } catch (error) {
    console.error('Booking email queue processor failed', error);
    return Response.json({ message: 'Booking email queue processing failed' }, { status: 500 });
  }
});

async function acknowledge(supabase: ReturnType<typeof createClient>, messageId: number) {
  const { error } = await supabase.rpc('ack_booking_email', { p_msg_id: messageId });
  if (error) throw error;
}

async function sendEmail(
  apiKey: string,
  from: string,
  message: { to: string; subject: string; text: string },
  idempotencyKey: string,
) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ from, to: message.to, subject: message.subject, text: message.text }),
  });
}

function getSupabase() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase secrets are not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}
