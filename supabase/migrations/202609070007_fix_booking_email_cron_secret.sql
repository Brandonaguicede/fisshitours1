-- Update the existing job to use the modern Supabase Secret API Key stored in
-- Vault. The job name and one-minute schedule remain unchanged.
do $$
declare
  v_job_id bigint;
  v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'booking_supabase_secret_key';

  if coalesce(trim(v_secret), '') = '' then
    raise exception 'Vault secret booking_supabase_secret_key is required';
  end if;

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
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'booking_supabase_secret_key')
        ),
        body := '{}'::jsonb
      );
    $job$
  );
end;
$$;
