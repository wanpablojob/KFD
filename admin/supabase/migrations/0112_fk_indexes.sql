-- --------------------------------------------------------------------------
-- 0112: an index for every foreign key
-- --------------------------------------------------------------------------
--
-- Postgres does not index a foreign key for you. The constraint is checked
-- with a scan of the child table, so deleting a restaurant -- or joining
-- orders to a rider -- reads the whole child table to find the rows that
-- point at it.
--
-- Ten of those columns had no index at all. The one that costs the most in
-- daily use is menu_items.restaurant_id: the storefront lists a shop's menu
-- on every visit, and it was a full scan of the menu table each time.
--
-- The indexes are ordinary b-trees on the foreign key column. Nothing about
-- the rules changes: an index is how the rows are found, not who may see them.
-- --------------------------------------------------------------------------

create index if not exists customer_favorites_restaurant_id_idx
  on public.customer_favorites (restaurant_id);

create index if not exists delivery_cash_collections_rider_id_idx
  on public.delivery_cash_collections (rider_id);

create index if not exists menu_items_restaurant_id_idx
  on public.menu_items (restaurant_id);

create index if not exists order_ratings_restaurant_id_idx
  on public.order_ratings (restaurant_id);

create index if not exists order_ratings_rider_id_idx
  on public.order_ratings (rider_id);

create index if not exists order_refunds_recorded_by_idx
  on public.order_refunds (recorded_by);

create index if not exists reoffer_push_queue_rider_id_idx
  on public.reoffer_push_queue (rider_id);

create index if not exists rider_applications_reviewed_by_idx
  on public.rider_applications (reviewed_by);

create index if not exists rider_cash_handovers_recorded_by_idx
  on public.rider_cash_handovers (recorded_by);

create index if not exists rider_notes_author_user_id_idx
  on public.rider_notes (author_user_id);
