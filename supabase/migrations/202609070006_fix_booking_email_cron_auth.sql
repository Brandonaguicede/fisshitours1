-- Migration 202609070005 created the stable job. This forward-only migration
-- changes only its server-to-server header; no second job is created.
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
    from cron.job
   where jobname = 'process-booking-emails';

  if v_job_id is null then
    raise exception 'process-booking-emails cron job does not exist';
  end if;

  perform cron.unschedule(v_job_id);

  perform cron.schedule(
    'process-booking-emails',
    '* * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'booking_supabase_url') || '/functions/v1/process-booking-emails',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'booking_supabase_service_role_key')
        ),
        body := '{}'::jsonb
      );
    $job$
  );
end;
$$;
