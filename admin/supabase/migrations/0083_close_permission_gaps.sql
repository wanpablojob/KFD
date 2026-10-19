-- --------------------------------------------------------------------------
-- Close three permission gaps found by auditing the catalog
--
-- Found by querying pg_proc, pg_policies and the column grants of a database
-- built from every migration, not by reading migrations, so it reflects the
-- schema as it actually is after 82 of them.
--
-- 1. A RESTAURANT COULD REWRITE OR DELETE ITS ORDERS. The "scoped access:
--    orders" policy is FOR ALL, and authenticated held Supabase's default
--    INSERT, UPDATE and DELETE on every column. So a merchant account could
--    change an order's total, the rider's frozen fee or the proof photo path,
--    mark it delivered without a rider, or delete it -- and deleting cascades
--    away the rider's payout and cash records. The merchant portal only ever
--    writes status and rejection_reason (setOrderStatus); every other order
--    change goes through a SECURITY DEFINER function, which runs as the owner
--    and is unaffected by client grants.
--
-- 2. admin_disputed_payouts() HAD NO ADMIN CHECK. It is SECURITY DEFINER and
--    executable by authenticated, so any signed-in customer could list rider
--    names, payout amounts and dispute reasons.
--
-- 3. refresh_restaurant_aggregates() WAS EXECUTABLE BY ANON. It only
--    recomputes counts from real orders, so it cannot corrupt them, but a
--    signed-out caller should not be able to trigger writes at all. It is
--    called by the orders trigger, which runs as the owner.
-- --------------------------------------------------------------------------

-- 1a. Clients may change status and rejection_reason, and nothing else.
revoke insert, update, delete, truncate on public.orders from anon, authenticated;
grant update (status, rejection_reason) on public.orders to authenticated;

-- 1b. ...and only along the transitions the merchant portal offers. Admins
-- keep any transition. Writes from SECURITY DEFINER functions (riders,
-- customers, dispatch) run as the owner, not as authenticated, so this does not
-- see them.
-- SECURITY INVOKER on purpose: a definer trigger would see current_user as its
-- owner on every write and could never tell a client from a function.
create or replace function public.orders_guard_client_status()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') or public.is_platform_admin() then
    return new;
  end if;

  if new.status is distinct from old.status
     and (old.status, new.status) not in (
       ('pending'::order_status, 'confirmed'::order_status),
       ('pending', 'cancelled'),
       ('confirmed', 'preparing'),
       ('confirmed', 'cancelled'),
       ('preparing', 'cancelled')
     ) then
    raise exception 'An order cannot move from % to % here.', old.status, new.status
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.orders_guard_client_status()
  is 'Limits a direct (non-admin) client update of orders to the merchant transitions: confirm, prepare, cancel (0083).';

drop trigger if exists orders_guard_client_status on public.orders;
create trigger orders_guard_client_status
  before update on public.orders
  for each row execute function public.orders_guard_client_status();

-- 2. Same body as 0075, plus the admin check. Non-admins get no rows rather
-- than an error, matching how RLS answers them elsewhere.
create or replace function public.admin_disputed_payouts()
returns table (
  order_id text,
  order_reference text,
  restaurant text,
  rider_id text,
  rider_name text,
  amount numeric,
  dispute_reason text,
  disputed_at timestamptz,
  review_expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.order_id,
         o.reference,
         o.restaurant,
         p.rider_id,
         r.name,
         p.amount,
         p.dispute_reason,
         p.disputed_at,
         p.review_expires_at
    from public.rider_payouts p
    join public.orders o on o.id = p.order_id
    join public.riders r on r.id = p.rider_id
   where p.settlement_state = 'disputed'
     and public.is_platform_admin()
   order by p.review_expires_at asc nulls last;
$$;

-- 3. Trigger-only.
revoke all on function public.refresh_restaurant_aggregates(text[]) from public, anon, authenticated;
