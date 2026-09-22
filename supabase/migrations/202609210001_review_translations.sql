-- Reviews were stored in a single `quote` column, in whatever language the
-- customer wrote them, and shown as-is to every visitor regardless of the
-- site's selected language. `quote_es`/`quote_en` hold the per-language
-- versions actually rendered on the public site; `quote` remains the
-- original text the customer submitted (kept for admin search/audit).
--
-- `translated` marks whether quote_es/quote_en were produced by the
-- translation provider. Existing rows are backfilled with quote_es = quote_en
-- = quote (identical to today's behavior — no regression) and left
-- `translated = false` so the one-time admin backfill tool can find and
-- translate them.
alter table public.reviews
  add column if not exists quote_es text,
  add column if not exists quote_en text,
  add column if not exists translated boolean not null default false;

update public.reviews
set quote_es = coalesce(quote_es, quote),
    quote_en = coalesce(quote_en, quote)
where quote_es is null or quote_en is null;

alter table public.reviews
  alter column quote_es set not null,
  alter column quote_en set not null;
