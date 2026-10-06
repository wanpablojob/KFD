-- --------------------------------------------------------------------------
-- 0050: rider suspension, distinct from archive
--
-- 0036 made archived_at mean "this rider must not be offered work". But archive
-- is the wrong verb for the two cases ops actually hit:
--
--   * A rider is under investigation, or is unwell, or their documents have
--     expired. The rider row, delivery history, rating and earnings all have to
--     stay exactly where they are, and the decision is temporary.
--   * Un-archiving is presented as "bringing somebody back", and 0010's UI copy
--     frames it that way, so using it for a suspension states something untrue.
--
-- Suspending needs to do exactly one thing that archiving did not: stop the
-- rider being offered and claiming deliveries, while leaving every record
-- intact and reversible with a stated reason. Archived_at cannot carry a
-- reason and its UI language is wrong, so this adds the two columns rather than
-- overloading the existing one. Both columns are nullable together: NULL means
-- "not suspended", which is the state of every pre-existing row without a
-- backfill.
--
-- Enforced in SQL, in the same five places 0036 touched, because RLS and the
-- security-definer RPCs are the only security boundary here (see
-- src/lib/supabase/merchant-queries.ts). A suspended flag that only the admin
-- UI respects is a flag a rider can walk past by calling PostgREST directly.
-- --------------------------------------------------------------------------

alter table riders
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text;

comment on column riders.suspended_at is
  'When an admin suspended this rider, or NULL. Independent of archived_at: a suspension is a temporary operational hold that keeps the rider row, history, rating and earnings intact and can be lifted.';
comment on column riders.suspended_reason is
  'Why the rider is suspended. Required when suspending (enforced by admin_set_rider_suspended), NULL when not suspended. Shown to admins only.';

-- --------------------------------------------------------------------------
-- audit_log: generic rider columns
--
-- 0028 built audit_log for exactly one table. Its shape cannot hold a rider
-- event:
--   * record_id is uuid, but riders.id is text (0001). A rider id does not fit.
--   * old_role/new_role/old_restaurant_id/new_restaurant_id are app_role and
--     restaurant references. There is no rider equivalent, so the before/after
--     columns would all be NULL and the row would say only "update".
--   * action is CHECK-constrained to insert/update/delete, so there is nowhere
--     to record WHICH kind of change it was.
--
-- So suspension needs a way to say "this rider was suspended, for this reason".
-- Adding three nullable columns is smaller and less risky than a second audit
-- table: 0028's app_users trigger and its reads keep working untouched, and the
-- rider timeline on the detail page is one query instead of a union of two
-- differently-shaped tables.
--
-- rider_id is deliberately text, not uuid, to match riders.id. account
-- attach/revoke is recorded as rider_id = NULL with the account in detail,
-- because the thing being changed is the link between a rider and an auth user
-- and either end can be named.
-- --------------------------------------------------------------------------
alter table audit_log
  add column if not exists rider_id text,
  add column if not exists event text,
  add column if not exists detail jsonb;

comment on column audit_log.rider_id is
  'riders.id when the audited change was to a rider, or NULL. Text, not uuid, because riders.id is text (0001). NULL for app_users rows.';
comment on column audit_log.event is
  'Dotted event name for non-CRUD changes, e.g. rider.suspended, rider.note_added. NULL for the app_users trigger rows, where `action` is the whole story.';
comment on column audit_log.detail is
  'Event-specific payload, e.g. the suspension reason or the attached account email. Shape is per-event and not validated; treat it as a display hint, not a contract.';

-- One writer for every rider event, so the actor is always auth.uid() and no
-- caller can forge it. SECURITY DEFINER because audit_log has no INSERT policy
-- by design (0028): writes are meant to come from trusted code, not clients.
-- Called by admin_set_rider_suspended here and by the note/access RPCs in 0051.
create or replace function public.audit_rider_event(
  p_rider_id text,
  p_event text,
  p_detail jsonb default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into audit_log (rider_id, event, detail, actor_user_id)
  values (p_rider_id, p_event, p_detail, auth.uid());
$$;

comment on function public.audit_rider_event(text, text, jsonb) is
  'Appends a rider event to audit_log with the calling user as the actor. Internal: not granted to anon or authenticated, so only security-definer functions can record an event.';

revoke all on function public.audit_rider_event(text, text, jsonb) from public;
revoke all on function public.audit_rider_event(text, text, jsonb) from anon;
revoke all on function public.audit_rider_event(text, text, jsonb) from authenticated;

-- The single choke point for "who is calling". Mirrors 0036's archived check:
-- a suspended rider resolves to no rider_id, so available_jobs() raises and
-- they have no feed to look at even before an offer reaches them.
create or replace function public.current_rider_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.id from riders r
   where r.user_id = auth.uid()
     and r.archived_at is null
     and r.suspended_at is null
   limit 1;
$$;

comment on function public.current_rider_id() is
  'The rider_id of the calling user, or null. Archived and suspended riders resolve to null. Used to enforce "riders act as themselves".';

revoke all on function public.current_rider_id() from public;
revoke all on function public.current_rider_id() from anon;
grant execute on function public.current_rider_id() to authenticated;

-- claim_order repeats the rider lookup rather than calling current_rider_id(),
-- for the same reason 0036 gives: it needs the name for the orders.rider
-- display mirror too. It therefore has to repeat the suspended check, or a
-- rider who accepted an offer moments before being suspended could still claim
-- it.
-- NOTE on rider_payout: this column is in the signature and must stay in it.
-- 0042 added it, and CREATE OR REPLACE cannot change a function's return type,
-- so dropping it here makes this migration fail outright with "cannot change
-- return type of existing function" -- which takes every migration after it
-- down as well. An earlier version of this file rebuilt the body from the 0035
-- copy, which predates the freeze, and silently lost the column.
--
-- The freeze itself has to stay for a second reason: rider_mark_delivered reads
-- o.rider_payout and writes coalesce(v_payout, 0) into the ledger, so a claim
-- that does not freeze one records a permanent 0.00 payout. Since 0038 the ledger
-- is the only source for every money figure in the product.
create or replace function public.claim_order(p_order_id text)
returns table (
  order_id text,
  reference text,
  restaurant text,
  delivery_address text,
  items jsonb,
  total numeric,
  rider_payout numeric,
  payment payment_method,
  placed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider_id text;
  v_rider_name text;
begin
  perform public.expire_stale_offers();

  select r.id, r.name into v_rider_id, v_rider_name
    from riders r
   where r.user_id = auth.uid()
     and r.archived_at is null
     and r.suspended_at is null;

  if v_rider_id is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from order_offers f
     where f.order_id = p_order_id
       and f.rider_id = v_rider_id
       and f.status = 'offered'
       and f.expires_at > now()
  ) then
    raise exception 'That delivery is no longer available.' using errcode = 'P0001';
  end if;

  update orders o
     set rider_id = v_rider_id,
         -- Display mirror for admin (queries.ts still selects orders.rider).
         -- Written here and nowhere else; rider_id remains the source of truth.
         rider = v_rider_name,
         -- Frozen now, not read at payout time. See the note above: without this
         -- the ledger records 0.00 for every delivery.
         rider_payout = public.rider_payout_per_delivery()
   where o.id = p_order_id
     and o.rider_id is null
     and o.status in ('pending', 'confirmed')
  returning o.id, o.reference, o.restaurant, o.delivery_address,
            o.items, o.total, o.rider_payout, o.payment, o.placed_at
    into order_id, reference, restaurant, delivery_address,
         items, total, rider_payout, payment, placed_at;

  if order_id is null then
    raise exception 'Someone else already took this delivery.' using errcode = 'P0001';
  end if;

  update order_offers
     set status = 'claimed', claimed_at = now()
   where order_id = p_order_id
     and rider_id = v_rider_id
     and status = 'offered';

  -- Everyone else's live offer for this order is now moot.
  update order_offers
     set status = 'expired'
   where order_id = p_order_id
     and status = 'offered'
     and rider_id <> v_rider_id;

  return next;
end;
$$;

comment on function public.claim_order(text) is
  'Atomically claims an offered delivery for the calling rider and assigns orders.rider_id. Exactly one rider can win a contested claim. Archived and suspended riders cannot claim.';

revoke all on function public.claim_order(text) from public;
revoke all on function public.claim_order(text) from anon;
grant execute on function public.claim_order(text) to authenticated;

-- The count in the admin list has to describe what dispatch will actually do,
-- or the button says "offer to 3" and offers to 1. Same predicate as
-- admin_dispatch_order below, deliberately. Gate stays is_admin() as 0036 wrote
-- it: is_admin() and is_platform_admin() have identical bodies, so switching it
-- would be churn in a function whose only change here is the rider filter.
create or replace function public.dispatch_unassigned_orders()
returns table (
  order_id text,
  reference text,
  customer text,
  restaurant text,
  restaurant_id text,
  city text,
  delivery_address text,
  items jsonb,
  total numeric,
  status order_status,
  placed_at timestamptz,
  live_offers integer,
  offers_made integer,
  declines integer,
  online_riders_in_city integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.reference,
    o.customer,
    o.restaurant,
    o.restaurant_id,
    r.city,
    o.delivery_address,
    o.items,
    o.total,
    o.status,
    o.placed_at,
    (select count(*)::int from order_offers f
      where f.order_id = o.id and f.status = 'offered' and f.expires_at > now()),
    (select count(*)::int from order_offers f where f.order_id = o.id),
    (select count(*)::int from order_offers f
      where f.order_id = o.id and f.status = 'declined'),
    (select count(*)::int from riders d
      where d.city = r.city
        and d.status = 'online'
        and d.archived_at is null
        and d.suspended_at is null)
  from orders o
  join restaurants r on r.id = o.restaurant_id
  where o.rider_id is null
    and o.status in ('pending', 'confirmed')
  order by o.placed_at;
end;
$$;

comment on function public.dispatch_unassigned_orders() is
  'Orders with no rider yet, for the admin dispatch list. Admins only. online_riders_in_city counts only riders dispatch could actually offer to. Nothing here expires an order automatically.';

revoke all on function public.dispatch_unassigned_orders() from public;
revoke all on function public.dispatch_unassigned_orders() from anon;
grant execute on function public.dispatch_unassigned_orders() to authenticated;

-- The dispatch roster: only riders who can actually be offered something. This
-- is not the rider directory -- /dashboard/riders still shows archived and
-- suspended riders, which is where an admin goes to lift a suspension or
-- un-archive somebody.
create or replace function public.dispatch_riders()
returns table (
  rider_id text,
  name text,
  phone text,
  city text,
  vehicle vehicle_type,
  status rider_status,
  deliveries integer,
  rating numeric,
  active_offers integer,
  claimed_today integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  return query
  select
    d.id,
    d.name,
    d.phone,
    d.city,
    d.vehicle,
    d.status,
    d.deliveries,
    d.rating,
    (select count(*)::int from order_offers f
      where f.rider_id = d.id and f.status = 'offered' and f.expires_at > now()),
    (select count(*)::int from orders o
      where o.rider_id = d.id
        and o.status not in ('delivered', 'cancelled')
        and o.placed_at >= date_trunc('day', now()))
  from riders d
  where d.archived_at is null
    and d.suspended_at is null
  order by (d.status = 'online') desc, d.name;
end;
$$;

comment on function public.dispatch_riders() is
  'Riders that can be offered a delivery: live, not suspended, online-first. Archived and suspended riders are excluded; the rider directory is where they are managed.';

revoke all on function public.dispatch_riders() from public;
revoke all on function public.dispatch_riders() from anon;
grant execute on function public.dispatch_riders() to authenticated;

-- The actual gate. A suspended rider is not offered work regardless of what the
-- admin picked.
create or replace function public.admin_dispatch_order(
  p_order_id text,
  p_rider_ids text[] default null
)
returns table (order_id text, offered_to integer)
language plpgsql
security definer
set search_path = public
as $$
-- Required, and required here as the first line inside the block (0041).
-- admin_dispatch_order returns TABLE(order_id text, ...), so `order_id` in the
-- body is a PL/pgSQL variable while order_offers also has an order_id column,
-- and the ON CONFLICT inference clause cannot tell them apart:
-- ERROR 42702: column reference "order_id" is ambiguous.
-- Qualifying does not help -- Postgres rejects `on conflict (o.order_id)` with a
-- syntax error. This directive tells plpgsql to prefer the column.
--
-- A rebuild from an older copy silently drops it, and admin_dispatch_order is
-- the only writer of order_offers, so with it broken no rider can ever claim
-- anything. Restored here for the same reason claim_order's rider_payout was.
#variable_conflict use_column
declare
  v_city text;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  perform public.expire_stale_offers();

  select r.city into v_city
    from orders o
    join restaurants r on r.id = o.restaurant_id
   where o.id = p_order_id
     and o.rider_id is null
     and o.status in ('pending', 'confirmed');

  if v_city is null then
    raise exception 'That order is not available for dispatch. It may already have a rider.' using errcode = '22023';
  end if;

  insert into order_offers (order_id, rider_id, status, expires_at)
  select p_order_id, d.id, 'offered', now() + interval '5 minutes'
    from riders d
   where (
          (p_rider_ids is null and d.city = v_city)
          or (p_rider_ids is not null and d.id = any (p_rider_ids))
        )
     and d.status = 'online'
     and d.archived_at is null
     and d.suspended_at is null
     -- Declines stick: a rider who turned this order down is not asked again.
     and not exists (
       select 1 from order_offers f
        where f.order_id = p_order_id
          and f.rider_id = d.id
          and f.status = 'declined'
     )
  on conflict (order_id, rider_id) where status = 'offered'
  do update set expires_at = excluded.expires_at;

  get diagnostics v_count = row_count;

  order_id := p_order_id;
  offered_to := v_count;
  return next;
end;
$$;

comment on function public.admin_dispatch_order(text, text[]) is
  'Offers an unassigned order to live online riders in the restaurant city, or to explicit rider ids. Archived and suspended riders are never offered. Admins only. Offers live for 5 minutes.';

revoke all on function public.admin_dispatch_order(text, text[]) from public;
revoke all on function public.admin_dispatch_order(text, text[]) from anon;
grant execute on function public.admin_dispatch_order(text, text[]) to authenticated;

-- --------------------------------------------------------------------------
-- admin_set_rider_suspended
--
-- The only writer of these two columns, so the "a reason is required" rule and
-- the audit row cannot be skipped by going through PostgREST instead of the
-- admin UI. Un-suspending clears both columns rather than recording the old
-- reason, because suspended_reason reads as "why this rider is suspended" and
-- leaving a stale reason on a rider who is working again is worse than losing
-- the text: the audit_log row below keeps it.
--
-- Deliberately does not change riders.status. A suspended rider keeps whatever
-- availability they last set; suspension is about being offered work, not about
-- claiming to be online. Dispatch already filters on suspended_at, so the stale
-- status is inert and restoring the rider is a single call.
--
-- P0001 rather than a 22xxx class code: this is a business rule violation, not
-- a malformed input, and 0043 established P0001 for that. It also carries a
-- message safe to show an admin.
-- --------------------------------------------------------------------------
create or replace function public.admin_set_rider_suspended(
  p_rider_id text,
  p_suspended boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_reason text;
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  v_reason := left(btrim(coalesce(p_reason, '')), 500);

  if p_suspended and v_reason = '' then
    raise exception 'A reason is required to suspend a rider.' using errcode = 'P0001';
  end if;

  select r.name into v_name from riders r where r.id = p_rider_id;

  if v_name is null then
    raise exception 'That rider no longer exists.' using errcode = 'P0001';
  end if;

  update riders
     set suspended_at = case when p_suspended then now() else null end,
         suspended_reason = case when p_suspended then v_reason else null end
   where id = p_rider_id;

  -- One writer for the audit row, so the actor is auth.uid() and the reason
  -- recorded here is the same string that was stored on the row.
  perform public.audit_rider_event(
    p_rider_id,
    case when p_suspended then 'rider.suspended' else 'rider.unsuspended' end,
    jsonb_build_object('reason', v_reason, 'rider_name', v_name)
  );
end;
$$;

comment on function public.admin_set_rider_suspended(text, boolean, text) is
  'Suspends or reinstates a rider. Admins only. A reason is required to suspend. Leaves the rider row, history, rating and earnings intact, and stops dispatch offering to them or letting them claim. Writes an audit_log row.';

revoke all on function public.admin_set_rider_suspended(text, boolean, text) from public;
revoke all on function public.admin_set_rider_suspended(text, boolean, text) from anon;
grant execute on function public.admin_set_rider_suspended(text, boolean, text) to authenticated;

-- Guard against a direct client UPDATE. The function is the only intended
-- writer, but RLS on riders is a select-only story for authenticated users, so
-- this is belt-and-braces for the case where a policy is later widened: it
-- makes "suspended_at was changed by something other than the RPC" impossible
-- to write at all.
create or replace function public.riders_block_direct_suspension_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.suspended_at is distinct from old.suspended_at
     or new.suspended_reason is distinct from old.suspended_reason then
    raise exception 'Use admin_set_rider_suspended to change suspension.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.riders_block_direct_suspension_write() is
  'Trigger guard: riders.suspended_at and suspended_reason may only be changed through admin_set_rider_suspended, so the reason requirement and the audit row cannot be bypassed by a direct UPDATE.';

drop trigger if exists riders_suspension_guard on riders;
create trigger riders_suspension_guard
  before update on riders
  for each row
  execute function public.riders_block_direct_suspension_write();

-- 0026 already installs set_updated_at() + riders_set_updated_at on this table,
-- so suspending bumps riders.updated_at for free and nothing is added here.
-- Trigger order is alphabetical, so this guard runs after set_updated_at: a
-- blocked suspension still advances updated_at. Acceptable, and preferable to
-- the alternative, which is trusting trigger ordering to keep a rejected write
-- from touching the row at all.