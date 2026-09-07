create extension if not exists pgmq;

do $$
begin
  perform pgmq.create('booking_email_queue');
exception
  when duplicate_object then null;
end;
$$;

create or replace function public.enqueue_booking_confirmation_emails(
  p_booking_id uuid,
  p_messages jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_message jsonb;
  v_notification_id uuid;
  v_queued integer := 0;
begin
  if jsonb_typeof(p_messages) <> 'array' then
    raise exception 'booking email messages must be an array' using errcode = '22023';
  end if;

  for v_message in select value from jsonb_array_elements(p_messages)
  loop
    v_notification_id := null;

    insert into public.booking_notifications (
      booking_id, type, channel, dedupe_key, payload, sent_at
    ) values (
      p_booking_id,
      'email',
      'email',
      v_message->>'dedupe',
      jsonb_build_object(
        'to', v_message->>'to',
        'subject', v_message->>'subject',
        'text', v_message->>'text'
      ),
      null
    )
    on conflict (dedupe_key) do nothing
    returning id into v_notification_id;

    if v_notification_id is not null then
      perform pgmq.send(
        'booking_email_queue',
        jsonb_build_object(
          'booking_id', p_booking_id,
          'notification_id', v_notification_id
        )
      );
      v_queued := v_queued + 1;
    end if;
  end loop;

  return jsonb_build_object('queued', v_queued);
end;
$$;

create or replace function public.ensure_booking_confirmation_email_queue(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_booking_status text;
  v_notification record;
  v_queued integer := 0;
begin
  select booking_status into v_booking_status
    from public.bookings
   where id = p_booking_id;

  if v_booking_status is null then
    raise exception 'booking not found' using errcode = '22023';
  end if;
  if v_booking_status <> 'confirmed' then
    raise exception 'booking must be confirmed before queuing confirmation email' using errcode = '22023';
  end if;

  for v_notification in
    select id, payload, sent_at
      from public.booking_notifications
     where booking_id = p_booking_id
       and dedupe_key like 'booking:' || p_booking_id::text || ':paypal-confirmation-%'
  loop
    -- Serialize recovery attempts for this logical notification. The lock is
    -- transaction-scoped, so concurrent retries cannot both enqueue a job.
    perform pg_advisory_xact_lock(hashtextextended(v_notification.id::text, 0));

    if v_notification.sent_at is null
       and not exists (
         select 1
           from pgmq.q_booking_email_queue q
          where q.message->>'notification_id' = v_notification.id::text
       ) then
      perform pgmq.send(
        'booking_email_queue',
        jsonb_build_object(
          'booking_id', p_booking_id,
          'notification_id', v_notification.id
        )
      );
      v_queued := v_queued + 1;
    end if;
  end loop;

  return jsonb_build_object('queued', v_queued);
end;
$$;

create or replace function public.dequeue_booking_email(
  p_visibility_timeout integer default 60
)
returns table(msg_id bigint, message jsonb)
language sql
security definer
set search_path = public, pgmq
as $$
  select q.msg_id, q.message
  from pgmq.read(
    'booking_email_queue',
    greatest(30, least(coalesce(p_visibility_timeout, 60), 3600)),
    1
  ) as q;
$$;

create or replace function public.ack_booking_email(p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = public, pgmq
as $$
  select pgmq.delete('booking_email_queue', p_msg_id);
$$;

revoke all on function public.enqueue_booking_confirmation_emails(uuid, jsonb) from public;
revoke all on function public.dequeue_booking_email(integer) from public;
revoke all on function public.ack_booking_email(bigint) from public;
revoke all on function public.ensure_booking_confirmation_email_queue(uuid) from public;

grant execute on function public.enqueue_booking_confirmation_emails(uuid, jsonb) to service_role;
grant execute on function public.dequeue_booking_email(integer) to service_role;
grant execute on function public.ack_booking_email(bigint) to service_role;
grant execute on function public.ensure_booking_confirmation_email_queue(uuid) to service_role;
