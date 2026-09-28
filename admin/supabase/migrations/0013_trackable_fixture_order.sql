-- --------------------------------------------------------------------------
-- One publicly trackable order.
--
-- 0012 made the tracking path safe, but every seeded order carries a legacy
-- "#KFD-10NN" reference, which is deliberately not trackable: those references
-- are sequential, so serving them without a session would be an enumeration
-- oracle. That leaves the public page with nothing it can show, which means
-- the feature cannot be exercised at all -- and an unverifiable security
-- control is not a control.
--
-- So this adds a single order in the shape the feature is actually for: a
-- walk-in with no account (customer_user_id stays null), a reference minted
-- with 48 bits of entropy, and no customer-facing detail beyond what
-- track_order() projects.
--
-- The reference is a literal rather than a mint_order_reference() call so the
-- browser checks can address a known order. A real order gets its reference
-- from the minting function, and the assertion in migrate-db.yml checks that
-- function still produces the 48-bit pattern.
-- --------------------------------------------------------------------------

insert into orders (
  id, reference, customer, restaurant, restaurant_id,
  items, subtotal, delivery_fee, total, status, payment, placed_at, rider
) values (
  'ord_1008',
  '#KFD-7A3F9C1E5B20',
  'Rowela Villanueva',
  'D & D Food Hub',
  'rst_01',
  '[{"name":"Inihaw na Liempo","quantity":2,"price":8.5},{"name":"Java Rice","quantity":1,"price":3.5}]',
  20.50, 1.90, 22.40, 'preparing', 'cash', now() - interval '20 minutes', 'Unassigned'
)
on conflict (id) do nothing;

-- Deliberately NOT set: customer_user_id.
--
-- A walk-in order is the common case and must stay valid with a null link. The
-- 0012 backfill left every existing order null too -- 0 of 9 matched an auth
-- display name, because these customers have no accounts -- so this is the same
-- state, not a special one.
--
-- Also worth being explicit about what the tracking page can never show, since
-- the row above does contain all of it: the customer's name, the restaurant's
-- id, the rider assignment. track_order() does not return them, and anon's
-- grant on orders is revoked, so neither the page nor anyone holding the public
-- anon key can read them off this row.
