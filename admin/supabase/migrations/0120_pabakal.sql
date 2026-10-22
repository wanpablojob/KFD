-- --------------------------------------------------------------------------
-- Pabakal: "buy this for me"
--
-- What KFD did on Messenger before the app: a customer lists what they want
-- from any store -- a pharmacy, a hardware, a sari-sari store that is not on
-- the app -- and a rider buys it and brings it. The customer sets a budget,
-- the rider fronts the money up to it, enters the receipt total once bought,
-- and collects item cost + delivery fee + pabakal fee in cash at the door.
--
-- Separate from orders on purpose: an order has a restaurant, a menu, prices
-- fixed at checkout and a payout ledger keyed to orders. A pabakal has none of
-- those -- the price is only known after the rider has bought it.
--
-- shortcut: cash only, and the rider keeps both fees (no platform cut, no cash
-- handover, not in the payout ledger). Upgrade when the owner sets the
-- pabakal fee split and whether GCash is accepted.
-- --------------------------------------------------------------------------

do $$
begin
  create type public.pabakal_status as enum (
    'open',        -- waiting for a rider
    'accepted',    -- a rider took it and is buying
    'delivering',  -- bought; receipt total recorded; on the way
    'delivered',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.pabakal_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique
    default ('#PBK-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  customer_user_id uuid references auth.users (id) on delete set null,
  customer_name text not null,
  contact_phone text,
  delivery_address text,
  barangay text,
  store text not null check (length(btrim(store)) between 2 and 120),
  items text not null check (length(btrim(items)) between 2 and 1000),
  note text check (note is null or length(note) <= 300),
  budget numeric(12, 2) not null check (budget > 0),
  delivery_fee numeric(12, 2) not null default 0,
  pabakal_fee numeric(12, 2) not null default 0,
  item_cost numeric(12, 2) check (item_cost is null or item_cost > 0),
  cash_collected numeric(12, 2),
  status public.pabakal_status not null default 'open',
  rider_id text references public.riders (id) on delete set null,
  cancel_reason text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  bought_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz
);

create index if not exists pabakal_requests_customer_idx
  on public.pabakal_requests (customer_user_id, created_at desc);
create index if not exists pabakal_requests_open_idx
  on public.pabakal_requests (created_at) where status = 'open';
create index if not exists pabakal_requests_rider_idx
  on public.pabakal_requests (rider_id);

comment on table public.pabakal_requests is
  'Pabakal (0120): a rider buys a customer''s list from any store and delivers it. Written only through the pabakal RPCs.';

-- Reads: the customer their own, the assigned rider theirs, admins all. Open
-- requests reach riders through rider_open_pabakal(), which leaves out the
-- customer's name, phone and address until a rider has taken the job.
alter table public.pabakal_requests enable row level security;

drop policy if exists "customers read own pabakal" on public.pabakal_requests;
create policy "customers read own pabakal" on public.pabakal_requests
  for select to authenticated using (customer_user_id = (select auth.uid()));

drop policy if exists "riders read assigned pabakal" on public.pabakal_requests;
create policy "riders read assigned pabakal" on public.pabakal_requests
  for select to authenticated using (rider_id = (select public.current_rider_id()));

drop policy if exists "admins read pabakal" on public.pabakal_requests;
create policy "admins read pabakal" on public.pabakal_requests
  for select to authenticated using ((select public.is_platform_admin()));

revoke all on table public.pabakal_requests from anon, authenticated;
grant select on table public.pabakal_requests to authenticated;


-- The two numbers the owner is most likely to change, in one place.
create or replace function public.pabakal_rules()
returns table (pabakal_fee numeric, max_budget numeric)
language sql
immutable
as $$ select 20.00::numeric, 2000.00::numeric $$;

comment on function public.pabakal_rules()
  is 'Pabakal fee on top of the delivery fee, and the most a rider is asked to front (0120).';

grant execute on function public.pabakal_rules() to authenticated;


create or replace function public.customer_request_pabakal(
  p_store text,
  p_items text,
  p_budget numeric,
  p_delivery_address text,
  p_barangay text default null,
  p_contact_phone text default null,
  p_note text default null
)
returns table (id uuid, reference text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_phone text := nullif(btrim(coalesce(p_contact_phone, '')), '');
  v_address text := nullif(btrim(coalesce(p_delivery_address, '')), '');
  v_barangay text := nullif(btrim(coalesce(p_barangay, '')), '');
  v_delivery_fee numeric;
  v_agreed boolean;
  v_rules record;
begin
  if auth.uid() is null
     or not exists (select 1 from app_users where user_id = auth.uid() and role = 'customer') then
    raise exception 'This action is for customers only.' using errcode = '42501';
  end if;
  if exists (
    select 1 from customers
     where user_id = auth.uid() and (blocked_at is not null or archived_at is not null)
  ) then
    raise exception 'Your account cannot place orders right now. Please contact support.'
      using errcode = '42501';
  end if;

  select * into v_rules from pabakal_rules();

  if length(btrim(coalesce(p_store, ''))) < 2 then
    raise exception 'Say which store to buy from.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_items, ''))) < 2 then
    raise exception 'List what to buy.' using errcode = '22023';
  end if;
  if length(p_items) > 1000 or length(p_store) > 120 or length(coalesce(p_note, '')) > 300 then
    raise exception 'That is too long. Keep the list short.' using errcode = '22023';
  end if;
  if p_budget is null or p_budget <= 0 or p_budget > v_rules.max_budget then
    raise exception 'Set a budget between ₱1 and ₱%.', to_char(v_rules.max_budget, 'FM999990')
      using errcode = '22023';
  end if;
  if v_address is null or length(v_address) < 8 then
    raise exception 'Enter your full delivery address.' using errcode = '22023';
  end if;

  -- Same service area and price rule as a food order (0080, 0084).
  select f.delivery_fee, f.fee_agreed_in_person into v_delivery_fee, v_agreed
    from order_fees(v_barangay) f;
  if exists (select 1 from service_areas) then
    if v_barangay is null then
      raise exception 'Choose your barangay.' using errcode = '22023';
    end if;
    if not exists (select 1 from service_areas sa where lower(sa.barangay) = lower(v_barangay))
       or (v_delivery_fee is null and not v_agreed) then
      raise exception 'We do not deliver to % yet.', v_barangay using errcode = '22023';
    end if;
  end if;

  select coalesce(nullif(btrim(raw_user_meta_data ->> 'name'), ''),
                  nullif(split_part(email, '@', 1), ''), 'Customer'),
         coalesce(v_phone, nullif(btrim(raw_user_meta_data ->> 'phone'), ''))
    into v_name, v_phone
    from auth.users where auth.users.id = auth.uid();

  if v_phone is null
     or length(regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 7 and 15
     or v_phone ~ '[^0-9+()\-[:space:]]' then
    raise exception 'Enter a valid contact number, e.g. 0917 123 4567.' using errcode = '22023';
  end if;

  if (select count(*) from pabakal_requests r
       where r.customer_user_id = auth.uid()
         and r.status in ('open', 'accepted', 'delivering')) >= 2 then
    raise exception 'You already have 2 pabakal on the way. Wait for one to arrive first.'
      using errcode = '22023';
  end if;

  return query
    insert into pabakal_requests as r
      (customer_user_id, customer_name, contact_phone, delivery_address, barangay,
       store, items, note, budget, delivery_fee, pabakal_fee)
    values
      (auth.uid(), v_name, v_phone, v_address, v_barangay,
       btrim(p_store), btrim(p_items), nullif(btrim(coalesce(p_note, '')), ''),
       round(p_budget, 2), coalesce(v_delivery_fee, 0), v_rules.pabakal_fee)
    returning r.id, r.reference;
end;
$$;


create or replace function public.customer_cancel_pabakal(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update pabakal_requests
     set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Cancelled by the customer'
   where id = p_id and customer_user_id = auth.uid() and status = 'open';
  if not found then
    raise exception 'This pabakal can no longer be cancelled: a rider already took it.'
      using errcode = 'P0001';
  end if;
end;
$$;


-- Open requests for riders, without the customer's personal details.
create or replace function public.rider_open_pabakal()
returns table (
  id uuid, reference text, store text, items text, note text, budget numeric,
  barangay text, delivery_fee numeric, pabakal_fee numeric, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_rider_id() is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;
  return query
    select r.id, r.reference, r.store, r.items, r.note, r.budget,
           r.barangay, r.delivery_fee, r.pabakal_fee, r.created_at
      from pabakal_requests r
     where r.status = 'open'
     order by r.created_at;
end;
$$;


create or replace function public.rider_claim_pabakal(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider text := public.current_rider_id();
begin
  if v_rider is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;
  -- One at a time: the rider is spending their own cash on it.
  if exists (select 1 from pabakal_requests
              where rider_id = v_rider and status in ('accepted', 'delivering')) then
    raise exception 'Finish your current pabakal first.' using errcode = 'P0001';
  end if;
  update pabakal_requests
     set status = 'accepted', rider_id = v_rider, accepted_at = now()
   where id = p_id and status = 'open';
  if not found then
    raise exception 'Someone else already took this pabakal.' using errcode = 'P0001';
  end if;
end;
$$;


create or replace function public.rider_pabakal_bought(p_id uuid, p_item_cost numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_budget numeric;
begin
  select budget into v_budget from pabakal_requests
   where id = p_id and rider_id = public.current_rider_id() and status = 'accepted'
   for update;
  if not found then
    raise exception 'That pabakal is not yours to update.' using errcode = '42501';
  end if;
  if p_item_cost is null or p_item_cost <= 0 then
    raise exception 'Enter the receipt total.' using errcode = '22023';
  end if;
  -- The customer agreed to the budget, not to more. Over it, the rider calls
  -- the customer first and buys less.
  if p_item_cost > v_budget then
    raise exception 'That is over the customer''s ₱% budget. Call them before buying more.',
      to_char(v_budget, 'FM999990.00') using errcode = '22023';
  end if;
  update pabakal_requests
     set status = 'delivering', item_cost = round(p_item_cost, 2), bought_at = now()
   where id = p_id;
end;
$$;


create or replace function public.rider_pabakal_delivered(p_id uuid, p_cash_collected numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_cash_collected is null or p_cash_collected < 0 then
    raise exception 'Enter the cash you collected.' using errcode = '22023';
  end if;
  update pabakal_requests
     set status = 'delivered', cash_collected = round(p_cash_collected, 2), delivered_at = now()
   where id = p_id and rider_id = public.current_rider_id() and status = 'delivering';
  if not found then
    raise exception 'That pabakal is not ready to be marked delivered.' using errcode = 'P0001';
  end if;
end;
$$;


-- The way out for a request nobody takes or a rider who cannot finish.
create or replace function public.admin_cancel_pabakal(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Give a reason.' using errcode = '22023';
  end if;
  update pabakal_requests
     set status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason)
   where id = p_id and status in ('open', 'accepted', 'delivering');
  if not found then
    raise exception 'That pabakal is already finished.' using errcode = 'P0001';
  end if;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'customer_request_pabakal(text, text, numeric, text, text, text, text)',
    'customer_cancel_pabakal(uuid)',
    'rider_open_pabakal()',
    'rider_claim_pabakal(uuid)',
    'rider_pabakal_bought(uuid, numeric)',
    'rider_pabakal_delivered(uuid, numeric)',
    'admin_cancel_pabakal(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
