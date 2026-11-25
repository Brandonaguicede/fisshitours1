-- READ-ONLY audit of the WhatsApp formats stored in public.customers. Run it in the Supabase SQL editor BEFORE deploying the customer
-- phone matching migration (202611240002). It returns only counts: no phone, name or email is ever selected.
--
-- "key" below is the same rule as public.phone_match_key / phoneMatchKey (see 202611240003_booking_contact_writers.sql), written inline
-- so this works before that function exists.

with phones as (
  select
    id,
    created_at,
    whatsapp,
    regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g') as digits,
    btrim(coalesce(whatsapp, '')) like '+%' as has_plus
  from public.customers
), keyed as (
  select *,
    nullif(case
      when digits = '' then null
      when has_plus then digits
      when digits like '00%' then substr(digits, 3)
      when char_length(digits) = 8 then '506' || digits
      else digits
    end, '') as key
  from phones
)
select 'customers_total' as metric, count(*)::bigint as value from keyed
union all select 'with_plus_506',                 count(*) from keyed where has_plus and digits like '506%'
union all select 'with_plus_other_country',       count(*) from keyed where has_plus and digits not like '506%'
union all select 'no_plus_506_prefix_11_digits',  count(*) from keyed where not has_plus and digits like '506%' and char_length(digits) = 11
union all select 'no_plus_exactly_8_digits',      count(*) from keyed where not has_plus and char_length(digits) = 8
union all select 'no_plus_00_prefix',             count(*) from keyed where not has_plus and digits like '00%'
union all select 'no_plus_other_format',          count(*) from keyed where not has_plus and digits <> ''
                                                    and not (digits like '506%' and char_length(digits) = 11)
                                                    and char_length(digits) <> 8 and digits not like '00%'
union all select 'empty_or_no_digits',            count(*) from keyed where digits = ''
-- Pairs of DIFFERENT customers that the new rule treats as the same phone but the old digit comparison did not (the would-be duplicates
-- once the checkout starts sending +506...). Customers that already share the same digits are listed separately.
union all select 'customer_groups_same_key_different_digits', count(*) from (
  select key from keyed where key is not null group by key having count(distinct digits) > 1
) g
union all select 'customers_in_those_groups', coalesce(sum(n), 0) from (
  select count(*) as n from keyed where key is not null group by key having count(distinct digits) > 1
) g
union all select 'customer_groups_same_digits_already_duplicated', count(*) from (
  select digits from keyed where digits <> '' group by digits having count(*) > 1
) g
order by metric;
