-- Prompt 2.5 -- persist the merchant's rejection reason.
--
-- A merchant could reject an order with a reason that was emailed to the
-- customer and then lost forever. An administrator reviewing a disputed or
-- abused order had no way to see what the restaurant said.
--
-- The 280 cap matches the UI cap in src/components/merchant/order-actions.tsx
-- and the server-side cap in /api/orders/notify, so the database is the final
-- backstop: all three layers agree.
--
-- Next free number verified with `ls supabase/migrations/`: 0008 was taken by
-- 00NN_aggregate_refresh.sql from Prompt 2.4.

alter table orders
  add column if not exists rejection_reason text;

comment on column orders.rejection_reason is
  'Merchant''s stated reason for cancelling an order. Set in the same UPDATE as '
  'status = ''cancelled''. Null for every other status, and null on orders '
  'cancelled before this column existed -- do not backfill a fabricated reason.';

-- Guarded so re-running the migration is safe, and so a 281-character reason
-- is rejected by the database rather than only by the UI.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_rejection_reason_max_len'
  ) then
    alter table orders
      add constraint orders_rejection_reason_max_len
      check (rejection_reason is null or char_length(rejection_reason) <= 280);
  end if;
end
$$;

-- No index: nothing filters on rejection_reason, and a speculative index on a
-- nullable text column is pure write cost.
