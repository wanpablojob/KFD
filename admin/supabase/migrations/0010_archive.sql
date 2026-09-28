-- Archive, rather than delete, for restaurants and riders (Prompt 3.2).
--
-- Why not a hard delete for restaurants:
--   orders.restaurant_id      -> restaurants(id) ON DELETE SET NULL
--   menu_items.restaurant_id -> restaurants(id) ON DELETE SET NULL
--   app_users.restaurant_id  -> restaurants(id) ON DELETE CASCADE
-- So deleting a restaurant would null out its order history and its menu, and
-- cascade away the merchant's own app_users row -- deprovisioning them. RLS
-- already treats a NULL restaurant_id as invisible, so the merchant would
-- silently lose access to their own past orders. None of that is recoverable.
--
-- Why not a hard delete for riders either:
--   Nothing references `riders` -- there is no orders.rider_id, only the
--   free-text orders.rider name. A hard delete would work, but it is
--   irreversible, and "remove a duplicate or a test rider" is not the kind of
--   mistake that should be permanent. Archiving makes the same mistake
--   recoverable at no extra cost.
--
-- `archived_at` is deliberately separate from `status`:
--   status      restaurant_status ('active' | 'approval' | 'suspended')
--               is a TRADING state -- should this restaurant be serving?
--   archived_at is a DATA-HYGIENE state -- is this row still in use?
-- Collapsing them would mean "archive this duplicate row" silently stopped a
-- restaurant trading, which is a different action with different consequences.
--
-- No index: both tables are a handful of rows, and the admin lists filter in
-- memory alongside every other column already being mapped.

alter table restaurants add column if not exists archived_at timestamptz;
alter table riders add column if not exists archived_at timestamptz;

comment on column restaurants.archived_at is
  'Set when the row is archived rather than deleted. NULL means live.';
comment on column riders.archived_at is
  'Set when the row is archived rather than deleted. NULL means live.';
