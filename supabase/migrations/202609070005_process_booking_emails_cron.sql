-- Supabase Cron invokes the protected worker once per minute. The endpoint and
-- service-role token are read from Vault at execution time and never stored in
-- this migration or exposed to the browser.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  v_job_id bigint;
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets
   where name = 'booking_supabase_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets
   where name = 'booking_supabase_service_role_key';

  if coalesce(trim(v_url), '') = '' or coalesce(trim(v_key), '') = '' then
    raise exception 'Vault secrets booking_supabase_url and booking_supabase_service_role_key are required before enabling the email cron';
  end if;

  select jobid into v_job_id
    from cron.job
   where jobname = 'process-booking-emails';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'process-booking-emails',
    '* * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'booking_supabase_url') || '/functions/v1/process-booking-emails',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'booking_supabase_service_role_key')
        ),
        body := '{}'::jsonb
      );
    $job$
  );
end;
$$;
