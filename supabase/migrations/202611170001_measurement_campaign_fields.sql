-- Consent-scoped campaign metadata only. No booking or payment state is changed.
alter table public.measurement_attribution
  add column if not exists fbclid text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text;

alter table public.measurement_attribution
  drop constraint if exists measurement_attribution_gclid_check,
  add constraint measurement_attribution_gclid_check
    check (gclid is null or (char_length(gclid) between 10 and 256 and gclid ~ '^[A-Za-z0-9_-]+$')),
  drop constraint if exists measurement_attribution_gbraid_check,
  add constraint measurement_attribution_gbraid_check
    check (gbraid is null or (char_length(gbraid) between 10 and 256 and gbraid ~ '^[A-Za-z0-9_-]+$')),
  drop constraint if exists measurement_attribution_wbraid_check,
  add constraint measurement_attribution_wbraid_check
    check (wbraid is null or (char_length(wbraid) between 10 and 256 and wbraid ~ '^[A-Za-z0-9_-]+$')),
  drop constraint if exists measurement_attribution_fbp_check,
  add constraint measurement_attribution_fbp_check
    check (fbp is null or (char_length(fbp) <= 320 and fbp ~ '^fb\.[0-9]+\.[0-9]+\.[A-Za-z0-9_-]+$')),
  drop constraint if exists measurement_attribution_fbc_check,
  add constraint measurement_attribution_fbc_check
    check (fbc is null or (char_length(fbc) <= 320 and fbc ~ '^fb\.[0-9]+\.[0-9]+\.[A-Za-z0-9_-]+$')),
  drop constraint if exists measurement_attribution_fbclid_format,
  add constraint measurement_attribution_fbclid_format
    check (fbclid is null or (char_length(fbclid) between 10 and 256 and fbclid ~ '^[A-Za-z0-9_-]+$')),
  drop constraint if exists measurement_attribution_campaign_format,
  add constraint measurement_attribution_campaign_format check (
    (utm_source is null or utm_source ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$') and
    (utm_medium is null or utm_medium ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$') and
    (utm_campaign is null or utm_campaign ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$') and
    (utm_content is null or utm_content ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$') and
    (utm_term is null or utm_term ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$')
  ),
  drop constraint if exists measurement_attribution_fbclid_consent,
  add constraint measurement_attribution_fbclid_consent
    check (marketing_consent or fbclid is null),
  drop constraint if exists measurement_attribution_campaign_consent,
  add constraint measurement_attribution_campaign_consent
    check (analytics_consent or (
      utm_source is null and utm_medium is null and utm_campaign is null and
      utm_content is null and utm_term is null
    ));
