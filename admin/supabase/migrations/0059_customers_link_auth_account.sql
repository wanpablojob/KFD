-- --------------------------------------------------------------------------
-- Link customers to the auth accounts that place their orders
--
-- `customers` (0001) has no `user_id` and holds five seed rows, so every real
-- customer created by register_customer() (0022) is invisible to
-- /dashboard/customers. `register_customer` writes only `app_users`, and
-- customer_place_order writes only `orders`, so nothing has ever created a
-- `customers` row for a real person.
--
-- `orders.customer_user_id` has existed since 0012, so the join the aggregates
-- need is real -- the "cannot be linked by id" note in the admin UI and in
-- queries.ts dates from 0008, before that column existed, and is now stale.
--
-- Two flags, deliberately separate, on the 0010 reasoning:
--   archived_at -- data hygiene: is this row still in use?
--   blocked_at  -- trading state: may this customer still order?
-- Collapsing them would make "archive this duplicate row" silently stop someone
-- ordering, which is a different action with different consequences.
--
-- `notes` is the operator's own note about the customer. Free text, written by
-- admins only (0059 puts the writes behind admin-checked functions).
--
-- `orders_count` / `total_spend` are left in place but are no longer read: they
-- are seed constants that nothing maintains. Dropping them is a separate,
-- separately-reviewed change once nothing selects them.
-- --------------------------------------------------------------------------

alter table public.customers
  add column if not exists user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists blocked_at timestamptz,
  add column if not exists notes text;

comment on column public.customers.user_id is
  'The auth account this customer signs in with. NULL for a row that was never linked to an account (the 0001 seed rows) -- such a row has no orders of its own and must not be shown with live aggregates.';
comment on column public.customers.archived_at is
  'Set when the row is archived rather than deleted (0010 reasoning). NULL means live.';
comment on column public.customers.blocked_at is
  'Set when the customer may no longer place orders. customer_place_order rejects a blocked or archived account. NULL means allowed.';
comment on column public.customers.notes is
  'Operator note about this customer. Admin-only.';

-- The aggregate RPCs group orders by customer_user_id and join customers on
-- this column, so it is the join key for every read on the customers pages.
create index if not exists customers_user_id_idx on public.customers (user_id);

-- --------------------------------------------------------------------------
-- Backfill: match seed rows to real accounts by EMAIL, never by name
--
-- Two guards, because the alternative is fabricating ownership:
--
--   * Email, not a display name. 0012 already backfilled orders by auth
--     display name and had to skip names held by more than one account. Email
--     is an identifier Supabase keeps unique; a display name is a label.
--   * The candidate must have role 'customer'. Without this, a merchant or
--     rider account that happens to share an address with a seed row would be
--     turned into a customer.
--
-- A row that matches nothing keeps user_id NULL and is reported, not guessed.
-- Those rows are the seed fixtures; the UI shows them as unlinked rather than
-- pretending they have an order history.
--
-- The counts are raised, not assumed -- read the notice after applying.
-- --------------------------------------------------------------------------
do $$
declare
  v_total integer;
  v_matched integer;
  v_ambiguous integer;
  v_still_null integer;
begin
  select count(*) into v_total
    from customers c
   where c.user_id is null;

  with email_map as (
    select
      lower(btrim(u.email)) as email,
      -- Postgres has no min(uuid) aggregate, so take the first element of the
      -- ordered array. Which row that is does not matter: this branch is only
      -- reached when holders = 1, so there is exactly one candidate.
      (array_agg(u.id order by u.id))[1] as user_id,
      count(*) as holders
    from auth.users u
    join app_users a on a.user_id = u.id and a.role = 'customer'
    where coalesce(btrim(u.email), '') <> ''
    group by 1
  ),
  updated as (
    update customers c
       set user_id = m.user_id
      from email_map m
     where m.holders = 1
       and c.user_id is null
       and lower(btrim(c.email)) = m.email
    returning 1
  )
  select count(*) into v_matched from updated;

  select count(*)
    into v_ambiguous
    from customers c
    join (
      select lower(btrim(u.email)) as email, count(*) as holders
        from auth.users u
        join app_users a on a.user_id = u.id and a.role = 'customer'
       group by 1
      having count(*) > 1
    ) m on m.email = lower(btrim(c.email))
   where c.user_id is null;

  select count(*) into v_still_null from customers where user_id is null;

  raise notice
    'customers.user_id backfill: % of % unlinked rows matched; % still null; % skipped as ambiguous',
    v_matched, v_total, v_still_null, v_ambiguous;

  -- Rows still null, listed rather than guessed. Expect the 0001 seed rows,
  -- which have no auth account at all.
  raise notice 'still unlinked: %', coalesce((
    select string_agg(c.id || ' (' || c.email || ')', ', ' order by c.id)
      from customers c
     where c.user_id is null
  ), 'none');
end;
$$;