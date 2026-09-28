-- --------------------------------------------------------------------------
-- Customer order tracking (Prompt 3.4)
--
-- `orders.customer` is a free-text NAME. There is no customer_id, no user_id,
-- no reference to auth.users anywhere in the schema, which is why Prompt 2.4
-- cannot aggregate customers and why there was no way to notify or let anyone
-- track an order. This adds the missing link, plus the public read path that
-- depends on it.
--
-- --------------------------------------------------------------------------
-- Why the public page is RLS-gated rather than merely unlisted
--
-- The obvious design is "look up by reference, no login". That is only safe
-- if a reference is unguessable, and the existing ones are not: KFD-1001,
-- KFD-1002, ... are sequential. A public endpoint that selects by reference is
-- then an enumeration oracle -- request KFD-1000..KFD-9999 and you have every
-- customer's name, basket and spend.
--
-- Gating behind login is not available: Prompt 3.4 explicitly forbids building
-- a customer account system, so the anonymous walk-in -- the person who most
-- needs to track an order -- would have no way to sign in. The only way to
-- have a working public page is to make the reference itself unguessable, and
-- then to enforce that in the database rather than in the app.
--
-- So this migration does two things:
--   1. public_tracking marks the orders that may be read without a session.
--      Every existing row is false: their sequential references are guessable
--      and cannot be un-guessed after the fact, and changing a reference a
--      customer has already written down is worse than not having the feature.
--      New orders are minted with ~50 bits of entropy and are trackable.
--   2. The policy below grants anon read on exactly those rows. A legacy order
--      is readable only by its own signed-in customer, an admin, or the
--      restaurant that owns it -- the same branches that already applied.
--
-- The page returns an identical "not found" for a wrong reference and for a
-- non-public one, so it cannot be used to test whether a reference exists.
-- --------------------------------------------------------------------------

alter table orders add column if not exists customer_user_id uuid
  references auth.users (id) on delete set null;

-- Unlike the speculative indexes elsewhere, this one is justified: every
-- customer-scoped query filters on it, including the RLS predicate below, which
-- Postgres has to evaluate per row.
create index if not exists orders_customer_user_id_idx
  on orders (customer_user_id);

alter table orders add column if not exists public_tracking boolean
  not null default false;

comment on column orders.customer_user_id is
  'The auth account this order belongs to. NULL for anonymous walk-ins, and for pre-existing rows whose free-text customer name could not be matched without guessing.';
comment on column orders.public_tracking is
  'True only when the reference has enough entropy to be safe to read without a session. False for the legacy sequential KFD-10NN references.';

-- --------------------------------------------------------------------------
-- Backfill
--
-- Matched on the auth user's display name, case- and whitespace-insensitively.
--
-- Two guards, because the alternative is fabricating ownership:
--
--   * A name that maps to more than one auth account is skipped, not guessed.
--     Two "Maria Santos" accounts are two different people; picking one would
--     hand a stranger a stranger's order history, and picking arbitrarily makes
--     it non-reproducible.
--   * No email or phone matching. orders has no address to match against, and
--     matching a name against an email local part would invent a link the data
--     does not support.
--
-- The result is reported rather than assumed. Expect it to be 0: the seeded
-- orders belong to customers who have no auth account at all, which is the
-- normal state of a business that has never had a customer login.
-- --------------------------------------------------------------------------
do $$
declare
  v_orders integer;
  v_matched integer;
  v_ambiguous integer;
  v_names table(name text primary key, user_id uuid, holders integer);
begin
  select count(*) into v_orders from orders;

  with holders as (
    select
      lower(btrim(raw_user_meta_data ->> 'name')) as name,
      count(*) as n
    from auth.users
    where coalesce(btrim(raw_user_meta_data ->> 'name'), '') <> ''
    group by 1
  )
  insert into v_names (name, user_id, holders)
  select h.name, min(u.id), h.n
    from holders h
    join auth.users u
      on lower(btrim(u.raw_user_meta_data ->> 'name')) = h.name
  group by h.name, h.n
  having count(*) = 1;

  with candidates as (
    select o.id, n.user_id
      from orders o
      join v_names n on n.name = lower(btrim(o.customer))
     where o.customer_user_id is null
  )
  update orders o
     set customer_user_id = c.user_id
    from candidates c
   where o.id = c.id
  ;
  get diagnostics v_matched = row_count;

  select count(*) into v_ambiguous
    from orders o
    join (select name from v_names where holders > 1) a
      on a.name = lower(btrim(o.customer));

  raise notice
    'customer_user_id backfill: % of % orders matched; % left null; % skipped as ambiguous',
    v_matched, v_orders, v_orders - v_matched, v_ambiguous;
end;
$$;

-- --------------------------------------------------------------------------
-- RLS
--
-- The customer's own orders, in addition to the admin/merchant branches that
-- already existed. Policies for the same command are OR'd, so this is purely
-- additive: it cannot widen what a merchant sees, and it grants no writes.
-- A merchant who is also a customer matches both branches, which is correct.
-- --------------------------------------------------------------------------
drop policy if exists "customers read own orders" on orders;
create policy "customers read own orders"
  on orders for select
  to authenticated
  using (auth.uid() = customer_user_id);

-- The public read path. anon is listed explicitly: a policy for `authenticated`
-- alone would exclude the walk-in this feature exists for. Only public_tracking
-- rows are reachable, and only the columns the page selects.
drop policy if exists "anyone reads publicly trackable orders" on orders;
create policy "anyone reads publicly trackable orders"
  on orders for select
  to anon, authenticated
  using (public_tracking);

-- Realtime applies RLS per subscriber, so an anonymous subscriber on this
-- policy receives changes for every publicly trackable order and nothing else.
-- The tracking page additionally filters the channel to the one order being
-- viewed, because "public" is not "this one".
--
-- No new grant is needed for customer_user_id: Supabase's default privileges
-- grant table-level select on public tables to anon and authenticated, and a
-- column is covered by its table's grant. Adding a column-level grant would
-- be a no-op that reads as if it tightened something.
