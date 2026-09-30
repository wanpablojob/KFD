-- --------------------------------------------------------------------------
-- updated_at triggers on core tables
--
-- Adds an updated_at column + trigger to orders, restaurants, and riders.
-- Enables analytics (prep time, delivery time, merchant response time) and
-- audit trails without relying on application-layer timestamps.
-- --------------------------------------------------------------------------

-- Helper: trigger function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at()
  is 'Trigger function: sets updated_at = now() on row update.';

-- 1. orders
alter table orders
  add column if not exists updated_at timestamptz not null default now();

create index if not exists orders_updated_at_idx on orders (updated_at);

drop trigger if exists orders_set_updated_at on orders;
create trigger orders_set_updated_at
  before update on orders
  for each row
  execute function public.set_updated_at();

comment on column orders.updated_at is 'Last modification timestamp (status changes, rider assignment, etc.).';

-- 2. restaurants
alter table restaurants
  add column if not exists updated_at timestamptz not null default now();

create index if not exists restaurants_updated_at_idx on restaurants (updated_at);

drop trigger if exists restaurants_set_updated_at on restaurants;
create trigger restaurants_set_updated_at
  before update on restaurants
  for each row
  execute function public.set_updated_at();

comment on column restaurants.updated_at is 'Last modification timestamp (status, archive, metrics refresh, etc.).';

-- 3. riders
alter table riders
  add column if not exists updated_at timestamptz not null default now();

create index if not exists riders_updated_at_idx on riders (updated_at);

drop trigger if exists riders_set_updated_at on riders;
create trigger riders_set_updated_at
  before update on riders
  for each row
  execute function public.set_updated_at();

comment on column riders.updated_at is 'Last modification timestamp (status toggle, earnings/deliveries increment, archive, etc.).';

-- 4. Grant trigger function execute to roles that update these tables
grant execute on function public.set_updated_at() to authenticated;