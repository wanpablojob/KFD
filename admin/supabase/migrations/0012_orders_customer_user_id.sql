-- --------------------------------------------------------------------------
-- Customer order tracking (Prompt 3.4)
--
-- `orders.customer` is a free-text NAME. There is no customer_id, no user_id,
-- and no reference to auth.users anywhere in the schema. That is why Prompt 2.4
-- could not aggregate customers, and why there is no way to notify a customer
-- or let one track an order.
--
-- This adds the missing link plus the read path that depends on it.
--
-- --------------------------------------------------------------------------
-- Why the public lookup is a function, and not a permissive RLS policy
--
-- The obvious design is "grant anon select on orders where public_tracking,
-- and let the page pick the columns it wants". That is a PII leak, and the
-- reason is worth writing down because it is not obvious:
--
--   RLS filters ROWS, never COLUMNS.
--
-- The Supabase anon key ships in the browser bundle. A row policy that admits
-- publicly trackable orders admits every column of those rows to anyone with
-- the key -- so `supabase.from('orders').select('*')` returns customer names,
-- rider assignments, restaurant ids and rejection reasons for every trackable
-- order in the database. The page not rendering those columns is irrelevant;
-- the API answers the request regardless of what the page does with it.
--
-- So anon gets NO grant on orders at all. The public path is a single
-- security definer function that returns a fixed projection, and nothing else
-- is reachable. Column exposure is then decided where it can actually be
-- enforced -- in the function's return type.
--
-- --------------------------------------------------------------------------
-- Why the reference has to carry the entropy
--
-- Requirement 3 says no login, because most walk-in customers have no account
-- and this prompt may not build one. So the reference IS the only secret, and
-- the existing ones are "#KFD-1001", "#KFD-1002" -- sequential, and seeded
-- densely. A lookup that accepts those is an enumeration oracle: sweep
-- KFD-1000..KFD-9999, ~9000 requests, and you have the entire order book.
--
-- So trackability is defined by the SHAPE of the reference, not by a flag on
-- the row. mint_order_reference() emits 12 hex characters, 48 bits:
--
--   16^12 = 2.8e14
--
-- Even at 1000 guesses/second that is ~9 years to exhaust one keyspace, and
-- the per-IP rate limit on the page bounds it further. Legacy sequential
-- references do not match the pattern, so they are not trackable -- which is
-- the correct outcome, not a gap: their entropy cannot be retrofitted without
-- changing a reference the customer has already written down.
--
-- Deriving trackability from the pattern also means it cannot be forgotten.
-- A flag has to be set by whatever creates an order, and the first future code
-- path that forgets is an enumeration oracle. A pattern is checked at the one
-- place that reads it.
-- --------------------------------------------------------------------------

alter table orders add column if not exists customer_user_id uuid
  references auth.users (id) on delete set null;

-- Unlike the speculative indexes elsewhere, this one is justified: the RLS
-- predicate below evaluates it per row, so every customer-scoped read uses it.
create index if not exists orders_customer_user_id_idx
  on orders (customer_user_id);

comment on column orders.customer_user_id is
  'The auth account this order belongs to. NULL for anonymous walk-ins, and for pre-existing rows whose free-text customer name could not be matched without guessing.';

-- --------------------------------------------------------------------------
-- Backfill
--
-- Matched on the auth user's display name, case- and whitespace-insensitively.
--
-- Two guards, because the alternative is fabricating ownership:
--
--   * A name held by more than one auth account is skipped, not guessed. Two
--     "Maria Santos" accounts are two different people; picking one hands a
--     stranger a stranger's order history, and picking arbitrarily makes the
--     result non-reproducible.
--   * No email or phone matching. orders has no address column, so matching a
--     name against an email local part would invent a link the data does not
--     support.
--
-- The counts are reported rather than assumed.
-- --------------------------------------------------------------------------
do $$
declare
  v_total integer;
  v_matched integer;
  v_ambiguous integer;
  v_still_null integer;
begin
  select count(*) into v_total from orders;

  with name_map as (
    select
      lower(btrim(raw_user_meta_data ->> 'name')) as name,
      min(id) as user_id,
      count(*) as holders
    from auth.users
    where coalesce(btrim(raw_user_meta_data ->> 'name'), '') <> ''
    group by 1
  ),
  updated as (
    update orders o
       set customer_user_id = m.user_id
      from name_map m
     where m.holders = 1
       and o.customer_user_id is null
       and lower(btrim(o.customer)) = m.name
    returning 1
  )
  select count(*) into v_matched from updated;

  with name_map as (
    select lower(btrim(raw_user_meta_data ->> 'name')) as name, count(*) as holders
    from auth.users
    where coalesce(btrim(raw_user_meta_data ->> 'name'), '') <> ''
    group by 1
  )
  select count(*)
    into v_ambiguous
    from orders o
    join name_map m on m.name = lower(btrim(o.customer))
   where m.holders > 1;

  select count(*) into v_still_null from orders where customer_user_id is null;

  raise notice
    'customer_user_id backfill: % of % orders matched; % left null; % skipped as ambiguous',
    v_matched, v_total, v_still_null, v_ambiguous;
end;
$$;

-- --------------------------------------------------------------------------
-- RLS
--
-- A signed-in customer's own orders, alongside the branches that already
-- existed. Policies for the same command are OR'd, so this is purely additive:
-- it cannot widen what a merchant sees, and it grants no writes.
--
-- Note this policy covers the whole row for that one customer, which is
-- correct -- it is their order. It is NOT a public path: the anon role has no
-- grant on this table at all.
-- --------------------------------------------------------------------------
drop policy if exists "customers read own orders" on orders;
create policy "customers read own orders"
  on orders for select
  to authenticated
  using (auth.uid() = customer_user_id);

-- --------------------------------------------------------------------------
-- Reference minting
--
-- 12 hex characters, 48 bits. Written as a function rather than in application
-- code so the entropy lives next to the pattern that validates it, and so it
-- is available to whichever component eventually places an order.
-- --------------------------------------------------------------------------
create or replace function public.mint_order_reference()
returns text
language sql
volatile
security invoker
set search_path = public
as $$
  -- gen_random_uuid() is core Postgres 13+ and therefore always resolvable
  -- under `set search_path = public`. gen_random_bytes() is pgcrypto, which
  -- Supabase installs in the `extensions` schema, so it would not resolve here
  -- -- and a minting function that only fails when an order is placed is the
  -- worst place to discover a missing extension.
  --
  -- A uuid carries 122 bits; 12 hex chars takes 48 of them.
  select '#KFD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
$$;

revoke all on function public.mint_order_reference() from public;
grant execute on function public.mint_order_reference() to anon, authenticated;

-- --------------------------------------------------------------------------
-- The public tracking read
--
-- Returns exactly: reference, restaurant, items, subtotal, delivery_fee,
-- total, status, payment, placed_at.
--
-- Deliberately absent: customer (a person's name), rider (internal assignment
-- and notes), restaurant_id, customer_user_id, rejection_reason, id. The
-- return type is the security boundary; adding a column here is a reviewable
-- change to what the public can read, which is the point.
--
-- Caller handling:
--   * high-entropy reference -> public. This is the walk-in path.
--   * otherwise -> only for a caller already entitled to the order through
--     RLS (admin, the owning restaurant, the order's own customer), so an
--     operator can look up a legacy order by the same URL.
--
-- security definer is required: anon has no grant on orders, so an invoker
-- function would fail for exactly the case this exists to serve. That makes
-- the entitlement re-check inside the function load-bearing, not decorative.
-- --------------------------------------------------------------------------
create or replace function public.track_order(p_reference text)
returns table (
  reference text,
  restaurant text,
  items jsonb,
  subtotal numeric,
  delivery_fee numeric,
  total numeric,
  status order_status,
  payment payment_method,
  placed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row orders;
  v_ref text;
begin
  if p_reference is null or btrim(p_reference) = '' then
    return;
  end if;

  -- Normalise once rather than enumerating shapes: references are stored
  -- '#KFD-1001', printed on receipts as 'KFD-1001', and arrive pasted in any
  -- case, sometimes with the '#'. Comparing the stripped, uppercased form
  -- handles all of it and cannot accidentally match a prefix.
  v_ref := upper(replace(btrim(p_reference), '#', ''));

  select * into v_row
    from orders o
   where upper(replace(o.reference, '#', '')) = v_ref
   limit 1;

  if not found then
    return;
  end if;

  if v_row.reference !~ '^#KFD-[0-9A-F]{12}$' then
    -- Legacy sequential reference. Public access is refused; an already
    -- entitled caller may still read it.
    --
    -- The entitlement check is inlined against app_users rather than reusing
    -- is_platform_admin() / current_merchant_restaurant(). This function is
    -- security definer and owned by the table owner, so it reads app_users
    -- regardless of RLS -- which is what makes the check authoritative rather
    -- than advisory. Calling the two helper functions instead would depend on
    -- their EXECUTE grant being visible from inside a definer body, and
    -- 0002 deliberately revoked that from public.
    if not (
      exists (
        select 1 from app_users
         where user_id = auth.uid() and role = 'admin'
      )
      or (
        v_row.restaurant_id is not null
        and exists (
          select 1 from app_users
           where user_id = auth.uid()
             and role = 'merchant'
             and restaurant_id = v_row.restaurant_id
        )
      )
      or (v_row.customer_user_id is not null and v_row.customer_user_id = auth.uid())
    ) then
      return;
    end if;
  end if;

  return query
    select
      v_row.reference,
      v_row.restaurant,
      v_row.items,
      v_row.subtotal,
      v_row.delivery_fee,
      v_row.total,
      v_row.status,
      v_row.payment,
      v_row.placed_at;
end;
$$;

revoke all on function public.track_order(text) from public;
grant execute on function public.track_order(text) to anon, authenticated;

-- anon keeps no direct access to the table. The default privileges Supabase
-- installs grant it, so this revoke is load-bearing, and the grant that
-- follows gives back only the columns a signed-in caller legitimately needs
-- (Supabase's own default is table-level, which covers new columns too).
revoke all on orders from anon;

-- --------------------------------------------------------------------------
-- Realtime
--
-- 0007 adds orders to the supabase_realtime publication, which is required for
-- postgres_changes and is confirmed by the assertion in migrate-db.yml.
--
-- RLS is applied per subscriber, so the customer policy above does govern
-- postgres_changes. But note what that means for the public page: an anon
-- subscriber has no grant on orders at all, so realtime cannot deliver
-- publicly trackable orders to it. The tracking page therefore polls the
-- function instead of subscribing, and this is stated in the hook rather than
-- left to be rediscovered. Signed-in customers keep the realtime path through
-- the policy above; the merchant hook is untouched.
--
-- No column-level grant is needed for customer_user_id: the authenticated
-- default is table-level select, which covers columns added later.
