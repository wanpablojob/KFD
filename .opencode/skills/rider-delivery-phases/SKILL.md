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
Dispatch landed in `0035`, so this rule no longer blocks Phase 2 — but the rider
app has no feed UI for `available_jobs()` yet, so the queue is still empty from a
rider's point of view until that is built.

## Where things actually are

| Surface | State |
| --- | --- |
| `mobile/src/app/rider/` | 3 tabs: Deliveries, Earnings, Profile |
| `screens/rider-home-screen.tsx` | 274 lines, pagination + refresh, no address |
| `fetch_rider_orders_page` | Defined in `0030`, **applied**, returns 401 when anon |
| `orders.rider_id` | Added in `0025`, **exists live**, RLS policy in place |
| Assignment mechanism | **Landed in `0035`** — `claim_order` is now the runtime writer |
| `/dashboard/dispatch` | **Landed** — unassigned orders + online riders |
| `rider_set_status` | Exists, consumed by nothing |
| `lib/push.ts` | Registered, ignored by the rider surface |
| `riders.earnings` | Trigger-maintained lifetime total, no ledger |
| Map SDK | Not in `package.json` |

Migrations `0001`–`0035` are applied to production with none pending. Before
`0035`, the only code that ever wrote `orders.rider_id` was the one-time
name-matching backfill in `0025`, so `where o.rider_id = v_rider_id` could never
match a new order. That is now closed: `claim_order()` is the only writer.

## Phase 0 — Unblock the schema (no UI, no new features)

**Done 2026-10-01.** `0024`'s `%`-without-argument `RAISE` was fixed to pass
`v_orphans` (`9e61c4e`), `0025` moved to `orders.rider_id text` with the RLS
policy and missing-argument `RAISE` fixed (`39d236c`), then `0024`–`0034` were
applied and `database.overrides.ts` was deleted wholesale (`fd716e3`,
`7213ef8`). `0027` aborts loudly on orphans, so a failure meant fix-the-data and
never did.

`fetch_rider_orders_page` is live and correctly gated: anon returns
`401 42501`, not `404 PGRST202`.

Note the parked `stash@{0}` ("customer phase1 WIP") also contains a draft
`0033_quote_order_and_rider_address.sql` that does the Phase 2 RPC change plus a
`quote_order` RPC. It is mid-edit and does not typecheck, and it is now
superseded by the real `0033_quote_order.sql` / `0034`. Recover it with
`git stash show -p stash@{0}` if anything in it is still wanted.

## Phase 1 — Dispatch queue with accept (backend + admin)

**Done.** Migration `0035_dispatch_offers.sql` is applied and
`admin/src/app/dashboard/dispatch` is the admin surface. Chosen over auto-assign
because `riders` has no location data, so "nearest rider" would be fiction until
a map SDK and background location land.

Shipped in `0035`:
- `order_offers` with `offer_status` (`offered`/`claimed`/`declined`/`expired`),
  a partial unique index making at most one live offer per order+rider pair.
- `available_jobs()`, `claim_order(p_order_id)` (the sole `orders.rider_id`
  writer, guarded by `and o.rider_id is null`), `decline_order(order, reason)`.
- `dispatch_unassigned_orders()`, `dispatch_riders()`,
  `admin_dispatch_order(order, rider_ids)`. All admin RPCs re-check the role
  inside a `security definer` body; the nav link being hidden is not the guard.

`0036` then closed an `archived_at` hole in the above: `status = 'online'` alone
let an archived rider be offered live work, and made the admin count lie.
Archived is now excluded in five places — `current_rider_id()`,
`claim_order()`, `admin_dispatch_order()`, `online_riders_in_city`, and
`dispatch_riders()`. The roster excludes archived because it is the dispatch
list, not the rider directory; `/dashboard/riders` is where you un-archive.

Decided: **5-minute expiry**, and a **decline returns the order to the pool** —
it stays unassigned and visible to admin, because it is still a customer waiting
on food. Nothing auto-expires an order into limbo, so the unassigned list grows
until a human deals with it.

Two known-imperfect details, both deliberate:
- `available_jobs()` is declared `stable` but sweeps stale offers via the
  nested `volatile` `expire_stale_offers()`. The `UPDATE` is legal because it
  executes inside the volatile helper, and PostgREST evaluates the function once
  per request, so nothing observes it. Not worth a second migration that would
  duplicate the function body. The sweep is not load-bearing anyway: both read
  paths already filter `expires_at > now()`, and re-offers re-arm the existing
  row through `ON CONFLICT ... DO UPDATE`.
- `orders.rider` is still mirrored on claim because `queries.ts` filters on it.
  It is a display mirror, never the source of truth.

**Done when:** an order placed by a customer appears in at least one online
rider's feed, and claiming it in two apps leaves exactly one winner.

**Not yet verified.** The schema, the arity, and the anon/admin gating are all
confirmed over the wire, but the actual race has never been run: `autoconfirm`
is off, signup needs approval, and no confirmed rider or admin credentials
exist in this environment. The "exactly one winner" done-test needs two
authenticated rider sessions against a seeded unassigned order.

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
is the expensive one and was the only phase needing a product decision.

Phase 0 and Phase 1 are backend and are both done. The rider UI does not
meaningfully begin until Phase 2, and Phase 2 is now unblocked.

Phase 2 item 4 has an open product decision: showing `₱{total}` next to a
customer's order implies it is rider pay. Do not invent a payout rate — either
add a real per-trip payout column or drop the peso figure.

## Rules

- One migration per phase, applied and verified before the next starts.
- Never write the denormalised `orders.rider` text as the source of truth. Write
  `rider_id`.
- No `as` casts on Supabase returns. Fix the types instead.
- `Mark delivered` is currently a single unconfirmed tap that fires for any
  non-terminal status. Do not add more destructive single-tap actions alongside it.
- Push is unverified on a physical device and `push.ts` errors on emulators.
  Do not build a phase that depends on push without a device.
