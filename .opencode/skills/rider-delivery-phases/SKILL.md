---
name: rider-delivery-phases
description: Use when planning, building, or reviewing rider app UI or dispatch work. Six ordered phases from unapplied-migrations to a working delivery job, each with a done-test. Read this before touching mobile/src/app/rider, rider-home-screen.tsx, rider-earnings-screen.tsx, fetch_rider_orders_page, or rider assignment logic.
---

# Rider delivery: the six phases

The rider app is mechanically sound and functionally empty. It has cursor
pagination, pull-to-refresh, a per-row spinner on mark-delivered, an
availability toggle, and an explicit no-profile state. What it has no is
anything to *do*.

**Hard rule: do not build rider UI before dispatch exists.** A rider app with an
empty queue looks broken to the rider, which is worse than shipping nothing.

## Where things actually are

| Surface | State |
| --- | --- |
| `mobile/src/app/rider/` | 3 tabs: Deliveries, Earnings, Profile |
| `screens/rider-home-screen.tsx` | 274 lines, pagination + refresh, no address |
| `fetch_rider_orders_page` | Defined in `0030`, **not applied to production** |
| `orders.rider_id` | Added in `0025`, **column does not exist live** |
| Assignment mechanism | **Does not exist in any form** |
| `rider_set_status` | Exists, consumed by nothing |
| `lib/push.ts` | Registered, ignored by the rider surface |
| `riders.earnings` | Trigger-maintained lifetime total, no ledger |
| Map SDK | Not in `package.json` |

Only code that ever writes `orders.rider_id` is the one-time backfill in
`0025`, which matches on rider *name* for pre-existing rows. `customer_place_order`
inserts no rider. So `where o.rider_id = v_rider_id` can never match a new order.

## Phase 0 — Unblock the schema (no UI, no new features)

**Why first:** the rider app currently calls an RPC that returns `404 PGRST202`.
Everything else is downstream of this. Zero product decisions.

1. Fix the `RAISE` bug in `0024_orders_restaurant_fk.sql` — it has a `%`
   placeholder with no argument, so it dies with `42601 too few parameters`
   instead of reporting orphan rows. Pass `v_orphans`.
2. Audit the other migrations for the same defect before pushing. Every
   `raise exception` with `%` needs its argument.
3. Apply `0024`–`0032` in order. `0024` and `0027` abort loudly on orphans
   rather than corrupting data, so a failure here means fix-the-data, not
   work-around-the-check.
4. Regenerate `admin/src/lib/supabase/database.types.ts` from the live project.
5. Delete the `PendingFunctions` block from
   `admin/src/lib/supabase/database.overrides.ts` — it exists only to type an
   RPC that was not there. Also delete the `submit_lead` override once `0032`
   lands.

**Done when:** `supabase gen types` shows `orders.rider_id` and
`fetch_rider_orders_page`; a rider sign-in loads the deliveries tab without a
404. The queue will still be empty. That is expected.

**Verified 2026-10-01:** `db push` was attempted and rolled back cleanly on
`0024`. Nothing was recorded. `0024`–`0032` remain pending.

Note the parked `stash@{0}` ("customer phase1 WIP") also contains a draft
`0033_quote_order_and_rider_address.sql` that does the Phase 2 RPC change plus a
`quote_order` RPC. It is mid-edit and does not typecheck; recover it with
`git stash show -p stash@{0}` when returning to customer work.

## Phase 1 — Dispatch queue with accept (backend + admin)

The chosen model. Chosen over auto-assign because the `riders` table has no
location data, so "nearest rider" would be a fiction until a map SDK and
background location land.

**Why this shape:** it reuses `rider_set_status`, which already exists and is
consumed by nothing. Availability becomes meaningful the moment something
listens to it.

Backend, one migration:
- `order_offers` table: order, rider, offered_at, expires_at, status
  (`offered`/`claimed`/`declined`/`expired`), decline reason.
- `available_jobs()` — offers for online riders whose city matches, unclaimed
  and unexpired.
- `claim_order(p_order_id)` — atomic. Succeeds for exactly one rider; sets
  `orders.rider_id`, marks the offer claimed, cancels sibling offers. This is
  the only place `rider_id` is written from here on, so the `0025` name-matching
  backfill is never reused.
- Decide explicitly what happens when no rider claims: order stays
  `confirmed` and the admin sees it in an unassigned list. Do not auto-expire an
  order into limbo.

Admin:
- A dispatch surface listing unassigned orders and online riders.

**Done when:** an order placed by a customer appears in at least one online
rider's feed, and claiming it in two apps leaves exactly one winner.

**Decide before coding:** expiry window, and whether a declined order returns to
the pool or goes to manual dispatch.

## Phase 2 — Make the job actionable (one migration, one screen)

Highest value per hour in the whole rider plan. The data mostly exists already
and is simply not being selected.

1. **Add `delivery_address` to `fetch_rider_orders_page`'s return table.** The
   column exists on `orders` since `0021` and is already populated by
   `customer_place_order`. It was never in the RPC's return table. This one
   change is the difference between a usable delivery card and a useless one.
2. **Customer contact.** Add a phone column, or join `customers`. Then a
   `tel:` deep link on the card.
3. **Render `items`.** The RPC returns them and the UI never draws them. A rider
   cannot see what they are picking up. Either inline the list or add an
   order-detail screen.
4. **Stop labelling the customer's order total as if it were rider pay.** It
   reads `₱{total} · {payment}` with no payout anywhere. Either add a per-trip
   payout column or remove the peso figure until Phase 3.

**Done when:** a rider can open an assigned job and knows where to go, what to
pick up, and how to call the customer — without asking anyone.

## Phase 3 — Earnings that mean something

- `rider_payouts` ledger, written by the delivery-completion trigger alongside
  the existing `0008` aggregate refresh.
- Replace the lifetime-only read on `earnings.tsx` with per-delivery history and
  daily/weekly rollups.
- Push the rider on delivery completion. `lib/push.ts` already supports it and
  the rider surface ignores it.

**Done when:** a rider can answer "what did I earn today" and "what was that
delivery worth" from the app.

## Phase 4 — Trust and safety

- Delivery proof: photo upload to Supabase Storage, or customer OTP. Both need a
  new bucket or column.
- A failed-delivery / return-to-merchant path. `markDelivered` has success only,
  so a rider who cannot deliver has nowhere to record it. This is the cheapest
  item here and worth doing before photo proof.
- Customer live location and a map view. Needs a map SDK, background location
  permission, and a location column — none exist.

## Phase 5 — Onboarding and growth

- Rider self-signup with document upload (licence, ORCR, ID) and admin
  approval, replacing `set_rider_access` provisioning.
- Shifts, delivery zones, multi-order batching.

## Sequencing

Phase 0 → 1 → 2 → 3 → 4 → 5. Phase 2 is the best value and the cheapest. Phase 1
is the expensive one and is the only phase needing a product decision.

Phase 0 and Phase 1 are backend. The rider UI does not meaningfully begin until
Phase 2.

## Rules

- One migration per phase, applied and verified before the next starts.
- Never write the denormalised `orders.rider` text as the source of truth. Write
  `rider_id`.
- No `as` casts on Supabase returns. Fix the types instead.
- `Mark delivered` is currently a single unconfirmed tap that fires for any
  non-terminal status. Do not add more destructive single-tap actions alongside it.
- Push is unverified on a physical device and `push.ts` errors on emulators.
  Do not build a phase that depends on push without a device.
