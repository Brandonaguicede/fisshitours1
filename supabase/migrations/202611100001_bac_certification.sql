-- Private certification ledger. Never creates bookings or changes tour prices.
create table public.bac_certification_payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('BAC-TEST-' || gen_random_uuid()::text),
  declared_brand text not null check (declared_brand in ('visa', 'mastercard', 'amex')),
  amount numeric(10,2) not null default 1.00 check (amount = 1.00),
  currency text not null default 'USD' check (currency = 'USD'),
  status text not null default 'prepared' check (status in ('prepared', 'processing', 'paid', 'failed')),
  actor uuid not null references auth.users(id),
  transaction_id text,
  authorization_code text,
  response_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  reconciled_by uuid references auth.users(id),
  reconciliation_note text,
  check (status <> 'paid' or nullif(transaction_id, '') is not null)
);
create unique index bac_certification_one_per_brand on public.bac_certification_payments(declared_brand)
  where status in ('prepared', 'processing', 'paid');
create unique index bac_certification_transaction_unique on public.bac_certification_payments(transaction_id)
  where transaction_id is not null;
alter table public.bac_certification_payments enable row level security;
revoke all on public.bac_certification_payments from public, anon, authenticated;
grant select, insert, update on public.bac_certification_payments to service_role;

create function public.prepare_bac_certification(p_brand text, p_actor uuid)
returns public.bac_certification_payments language plpgsql security definer set search_path = public as $$
declare v_row public.bac_certification_payments;
begin
  if p_brand not in ('visa','mastercard','amex') or p_brand is null then raise exception 'Invalid brand'; end if;
  perform pg_advisory_xact_lock(hashtext('bac-certification:' || p_brand));
  select * into v_row from public.bac_certification_payments
    where declared_brand = p_brand and status in ('prepared','processing','paid') for update;
  if found then
    -- Another operator's prepared form is not transferred while it could be used.
    if v_row.status = 'prepared' and v_row.expires_at < now() then
      update public.bac_certification_payments set actor=p_actor, expires_at=now()+interval '30 minutes', updated_at=now()
        where id=v_row.id returning * into v_row;
    end if;
    return v_row;
  end if;
  if (select count(*) from public.bac_certification_payments where declared_brand=p_brand) >= 3 then
    raise exception 'Certification attempt limit reached' using errcode='54000';
  end if;
  insert into public.bac_certification_payments(declared_brand,actor) values(p_brand,p_actor) returning * into v_row;
  return v_row;
end; $$;

create function public.begin_bac_certification(p_id uuid, p_actor uuid)
returns public.bac_certification_payments language plpgsql security definer set search_path = public as $$
declare v_row public.bac_certification_payments;
begin
  select * into v_row from public.bac_certification_payments where id=p_id for update;
  if not found or v_row.actor <> p_actor or v_row.status <> 'prepared' or v_row.expires_at <= now() then
    raise exception 'Certification payment cannot be started' using errcode='55000';
  end if;
  update public.bac_certification_payments set status='processing',updated_at=now() where id=p_id returning * into v_row;
  return v_row;
end; $$;

revoke all on function public.prepare_bac_certification(text,uuid) from public,anon,authenticated;
revoke all on function public.begin_bac_certification(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_bac_certification(text,uuid) to service_role;
grant execute on function public.begin_bac_certification(uuid,uuid) to service_role;
