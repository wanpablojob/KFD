---
name: mobile-gap-analysis
description: Use when planning or scoping any mobile app feature work in KFD. Records what the mobile app currently does and does not do, and the Foodpanda-parity gap list with phase ordering, so plans are grounded in existing code instead of re-derived.
---

# Mobile gap analysis vs Foodpanda

Snapshot of `mobile/` as of `f1a3b4a`-era code, ~5,300 lines across 34 TS/TSX
files. Re-verify against the source before relying on any line claim below.

## Rider app (`mobile/src/app/rider/`, `mobile/src/screens/rider-home-screen.tsx`)

Three tabs, 274 lines for the deliveries screen. Solid mechanics: cursor
pagination via `fetch_rider_orders_page`, pull-to-refresh, optimistic-free
`markDelivered` with a per-row spinner, `rider_set_status` availability toggle
in profile, and an explicit "no rider profile linked" state.

The problem is that riders have nothing to *do*. There is no assignment
mechanism anywhere in the system.

### Rider Phase 1 — the app cannot receive work

- **No assignment mechanism exists at all.** The only code that ever writes
  `orders.rider_id` is the one-time backfill in `0025_orders_rider_fk.sql`,
  which matches on rider *name* for pre-existing rows. `customer_place_order()`
  in `0023` inserts no rider, and `0010_archive.sql` only references the column.
  So `fetch_rider_orders_page`'s `where o.rider_id = v_rider_id` can never match
  a new order. The rider app is a working viewer over a queue nothing feeds.
- **No dispatch surface.** With no auto-assign, no available-jobs feed, and no
  accept/decline, someone must assign by hand — and the admin has no
  rider-assignment UI either. This is a backend + admin gap before it is a
  mobile gap, and it blocks every other rider feature.
- **Rider cannot see where to deliver.** `fetch_rider_orders_page` returns
  `id, reference, customer, restaurant, items, total, status, payment,
  placed_at, next_cursor`. `delivery_address` was added to `orders` in `0021`
  but is **not** in the RPC's return table, and `RiderOrderPageItem` has no
  address field. The rider sees a reference, a restaurant name, and a customer
  name — literally nowhere to go.
- **No way to contact the customer.** `orders` has no customer phone column and
  `RiderOrderPageItem` carries none. No call, no chat, no directions link.
- **`Mark delivered` is a single unconfirmed tap.** No photo proof, no OTP, no
  customer confirmation, and no cancel/failed-delivery path. It fires
  `rider_mark_delivered` directly for any non-terminal status.

### Rider Phase 2 — day-to-day usability

- No customer live location or map view; no map SDK in `package.json` at all.
- No order-detail screen. `items` is returned by the RPC but never rendered —
  the card shows reference, restaurant, customer, total. A rider cannot see
  what they are picking up.
- No pickup instructions or merchant contact.
- **The `₱` figure on the delivery card is the customer's order total, not the
  rider's pay.** There is no per-trip delivery fee or payout column anywhere in
  the schema, so `rider.earnings` has no per-order breakdown to show.
- Availability is a manual button, and nothing consumes it — no dispatcher, no
  push to online riders when work appears.

### Rider Phase 3 — earnings and trust

- `earnings.tsx` renders lifetime `earnings`/`deliveries` off the `riders` row.
  No per-delivery ledger, no daily/weekly breakdown, no payout or cash-out, no
  history. `riders.earnings` is maintained by a trigger (see `0008`), so the
  number is right but unauditable from the app.
- No in-app earnings notification on delivery completion.
- No rider performance or incentive surface; `rating` is never written by a
  customer.

### Rider Phase 4 — onboarding and growth

- Riders are provisioned via `0018_rider_access` / `set_rider_access` from the
  admin. No self-signup, no document upload (license, ORCR, ID), no background
  check, no vehicle verification. `riders` has no document columns.
- No shift or schedule, no zone/preferred-area assignment, no batching of
  multiple deliveries into one trip.

### Rider Phase 5 — platform hardening

- Push is registered via the shared `lib/push.ts` but never verified on a
  physical device; `push.ts` returns an explicit error on emulators, and there
  is no notification handling in the rider surface at all — no "new job" alert,
  so a rider must keep the app open to notice work.
- No background location tracking, which is what a real delivery app needs for
  dispatch and customer ETA.
- No offline behaviour. `connectivity-context.tsx` reports the network state but
  `markDelivered` has no retry or queue — a failed tap loses the action.

### Rider sequencing note

Do not build rider UI before dispatch exists. A rider app with an empty queue
is worse than no rider app, because it looks broken to the rider. Critical path:
assignment mechanism (backend) → dispatch UI (admin) → address and contact
added to `fetch_rider_orders_page` (RPC) → then rider UX.

## Rider fix plan, in dependency order

Each phase is independently shippable and leaves the system in a working state.
Do not start a phase before the previous one is verified in production.

### Rider Fix 0 — unblock what is already written (no new code)

This is not optional groundwork; it is the reason the rider app looks dead.

**Finding, verified against the live project with `supabase gen types`:**
`fetch_rider_orders_page` does not exist in production. It is defined in
migration `0030_rider_orders_pagination.sql`, which is committed but not
applied. Live `orders` also has no `rider_id` column at all — the two `rider_id`
hits in the generated types belong to `set_rider_access(p_email, p_rider_id)`,
not to `orders`.

So the rider app currently calls an RPC that returns `404 PGRST202`, and
`rider_id` — the column every rider query filters on — has never been created.
`0024`–`0032` are all unapplied; `0032` is already documented as unapplied in
`database.overrides.ts`.

- Verify each of `0024`–`0032` actually ran before marking any applied; the
  history is inconsistent, so do not trust the folder.
- Apply them in order, then regenerate `database.types.ts` and delete the
  `PendingFunctions` block.
- Confirm `fetch_rider_orders_page` exists and `orders.rider_id` exists.
- Re-test rider sign-in and the deliveries tab. The queue will still be empty
  for want of an assignment path, which is Fix 1.

### Rider Fix 1 — assignment mechanism (the real blocker)

Nothing assigns a rider today. Pick one model; do not build both.

- **Option A, auto-assign on order placement.** In `customer_place_order()`
  (`0023`), after insert, select the nearest online rider. Cheapest to operate,
  no rider UI needed, but needs location data the riders table does not have.
- **Option B, dispatch queue with accept.** New `order_offers` table plus
  `available_jobs` / `claim_order` RPCs. Closest to how Foodpanda-style
  marketplaces work and it uses `rider_set_status`, which already exists and is
  currently consumed by nothing. Costs a migration plus a rider feed screen.

Either way this needs: an `orders.rider_id` write path (column arrives with
`0025`), a decision on what happens when no rider is free, and an admin surface
if dispatch stays manual. Whatever is chosen must set `rider_id`, not the
denormalised `rider` text, so the name-matching backfill in `0025` is not
reused.

### Rider Fix 2 — make the order actionable

Smallest high-value change in the whole rider plan. One migration, one RPC
change, one screen.

- Add `delivery_address` to `fetch_rider_orders_page`'s return table; the column
  already exists on `orders` since `0021` and is already populated by
  `customer_place_order()`. This alone is what turns the delivery card from
  useless into usable.
- Add customer phone to `orders` (via a new column or a join to `customers`),
  and surface a call/chat deep link.
- Add `items` to the rendered card or an order-detail screen — the data is
  already returned and never displayed.
- Stop labelling the customer's order total as if it were rider pay. Add a
  per-trip payout column, or remove the peso figure until Fix 3.

### Rider Fix 3 — earnings that mean something

- New `rider_payouts` ledger written by the delivery-completion trigger
  alongside the existing `0008` aggregate refresh. Migration plus trigger.
- Per-delivery history, daily/weekly rollups, and cash-out on `earnings.tsx`,
  replacing the lifetime-only read off the `riders` row.
- Push the rider on delivery completion; the shared `lib/push.ts` already
  supports it and the rider surface ignores it today.

### Rider Fix 4 — trust and safety

- Delivery proof: photo upload to Supabase Storage, or customer OTP confirm.
  Both need a new bucket or column; neither exists.
- A failed-delivery / return-to-merchant path. `markDelivered` currently has
  only success, so a rider who cannot deliver has nowhere to record it.
- Customer live location for the rider to follow, plus a map view. Needs a map
  SDK, background location permission, and a location column — none present.

### Rider Fix 5 — onboarding

- Rider self-signup with document upload (licence, ORCR, ID) and admin approval,
  replacing `set_rider_access` provisioning. Needs document columns on
  `riders` and a Storage bucket.
- Shifts, delivery zones, and multi-order batching.

### Sequencing summary

Fix 0 → Fix 1 → Fix 2 → Fix 3 → Fix 4 → Fix 5. Fix 2 is the highest
value-per-hour item in the plan and the cheapest. Fix 1 is the expensive one and
needs a product decision between auto-assign and a dispatch queue.

## What already exists (do not plan these)

| Area | Implementation |
|---|---|
| Auth | `lib/auth.ts`, email + OAuth via `expo-auth-session`, role routing |
| Catalogue | `fetchActiveRestaurants`, `searchRestaurants` RPC, cuisine chips, debounced search |
| Menu | `fetchMenu`, grouped by category, client-side cart staging |
| Cart | `lib/cart-context.tsx`, single-restaurant guard, quantity edit, remove |
| Checkout | `cart.tsx`, address text field, cash/card/e-wallet, server-priced via `customer_place_order` |
| Orders | `customer/orders.tsx`, realtime `postgres_changes` on `orders` |
| Tracking | `track.tsx`, `track-order-screen.tsx`, `track_order` RPC |
| Rider | `rider-home-screen.tsx` (cursor-paginated assigned orders, mark delivered), `earnings.tsx`, `profile.tsx` |
| Platform | TanStack Query + persisted cache, NetInfo offline awareness, Sentry, Expo push with token rotation, SecureStore, ErrorBoundary |

## Gaps, ordered into phases

### Phase 1 — correctness (blocks a public launch)

- **Delivery address is a free-text field.** `cart.tsx` holds `address` in
  component state. No saved addresses, no pin, no validation, and nothing
  persists between orders. Foodpanda has an address book plus a map pin.
- **No ETA anywhere.** Nothing computes or displays delivery time. The single
  hardcoded `DELIVERY_FEE = 45` lives in *both* `customer/index.tsx` and
  `cart.tsx` rather than coming from the restaurant or a fee table, so it is
  already inconsistent with the server's own pricing.
- **Order status is not pushed to the customer in-app.** Push registration
  exists in `lib/push.ts` and admin has `/api/orders/notify`, but the customer
  app has no notification inbox and `customer/orders.tsx` relies on a realtime
  channel that only fires while the app is open. `mark_notifications_seen` and
  the `notifications` concepts exist in migrations but are unused by mobile.
- **Track screen does not live-update.** `track-order-screen.tsx` has no
  `postgres_changes` subscription and no polling, unlike the orders list.
- **Multi-restaurant cart fails silently.** `cart-context.tsx` *returns the old
  cart unchanged* when a line from another restaurant is added; only checkout
  surfaces "more than one place". Adding from a second restaurant appears to do
  nothing. Foodpanda prompts to clear the cart.

### Phase 2 — trust and money

- No reorder from order history (Foodpanda's single most-used control).
- No order cancellation or cancel-request flow for the customer.
- No ratings or reviews; `restaurants.rating` and `riders.rating` exist but are
  never written by a customer.
- No promo codes, vouchers, or `service_fee` transparency. `SERVICE_FEE` is
  client-side in `cart.tsx` while the server computes its own, so the displayed
  total can disagree with the charged total.
- No order receipt, and no scheduled/pre-order despite the backend supporting
  only immediate orders.
- Cart is in-memory only: `CartProvider` holds `useState` with no persistence,
  so a backgrounded app loses the cart.

### Phase 3 — discovery and retention

- No favourites/wishlist, no reordering from a restaurant page, no "your
  frequent orders".
- No photo on restaurant rows or menu items; the schema has none, so this is a
  migration plus upload pipeline, not just UI. The landing page was explicitly
  built photo-free; decide deliberately rather than by omission.
- No dietary tags, spice level, or allergens on `menu_items`.
- Search is name/cuisine substring only — no delivery-area filtering, so a
  customer outside the coverage zone sees restaurants they cannot order from.
  Delivery area is hardcoded as "Kabankalan City" in `customer/index.tsx`.

### Phase 5 — platform hardening

- Push is registered but never verified end-to-end on a physical device;
  `push.ts` explicitly returns an error on emulators.
- No offline order queuing. `connectivity-context.tsx` knows the network is
  down but checkout does not degrade.
- No deep linking into a restaurant or order from a shared link, no universal
  links.
- No localisation. Taglish copy is hardcoded in screens; no string catalogue.
- No analytics or crash-to-funnel beyond Sentry.

## Sequencing advice

Phase 1 first and in full: an unaddressed order, a wrong total, and a
customer who cannot tell their order moved are all launch-blockers, and several
Phase 2 items (service fee transparency, cart persistence) share the same code
touchpoints. Phase 4 needs backend work — assignment logic, payouts, proof —
so it is the longest pole and should at least be specced early even if built
late.
