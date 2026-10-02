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

**Done.** Migration `0037_rider_actionable_job.sql`. The card now answers where
to go, what to pick up, how to call the customer, and what the rider earns.

1. `delivery_address` is in `fetch_rider_orders_page`'s return table.
2. Customer contact is `orders.customer_phone`, snapshotted from the auth
   profile at order time. There is deliberately **no** order→customers join:
   `customers.id` is free text with no auth link and `orders.customer_user_id`
   is a uuid, so the only path is the profile the customer maintains. "No
   contact number on file" is a real state the card states, not a dead `tel:`.
3. `items` is parsed and rendered.
4. The customer's total is gone. `rider_payout_per_delivery()` defines the
   flat 25.00 rate in one place, `claim_order` **freezes** it onto the order,
   and `rider_mark_delivered` adds it to `riders.earnings` on completion.
   Snapshot rather than compute-on-read so a past delivery keeps its agreed
   value when the rate changes.

Two traps worth remembering, both found the hard way:

- **Rebuilding a function means rebuilding it from its *latest* definer, not
  its first.** `customer_place_order` was last redefined in `0033`, not `0023`.
  Writing from `0023` silently dropped the closed-restaurant check, the
  empty-cart guard and `mint_order_reference()`. Always diff the new body
  against the live one and assert only the intended lines differ. Same class of
  error: `rider_mark_delivered`'s real version is in `0025`, not `0018`.
- **`is distinct from`, never `<>`,** in an ownership guard. With a NULL
  `rider_id`, `null <> 'abc'` is NULL rather than true, so the check passes.
  `0025` already had this right; do not "simplify" it.

Also note gen-types cannot infer nullability for a `RETURNS TABLE` and returns
every column as non-null, even `next_cursor`, which is explicitly NULL on the
last page. Map those columns explicitly rather than casting.

## Phase 3 — Earnings that mean something

**Done.** Migrations `0038` (ledger) and `0039` (table privileges).

- `rider_payouts` ledger, one row per completed delivery, written by
  `rider_mark_delivered` with the payout frozen at claim time.
- `rider_earnings_summary` (today / week / lifetime / count) and
  `rider_payout_history` (per-delivery, with `has_more`) sum the ledger, so
  `earnings.tsx` answers "what did I earn today" and "what was that delivery
  worth".
- `riders.earnings` is reconciled to the ledger sum, because the `0001` seed
  values were never real earnings and leaving them put the admin dashboard and
  the rider app in open disagreement.

Three things worth remembering here:

1. **A seeded demo column is not a total.** `0001` seeds `rdr_01` at
   `earnings 2840.00 / deliveries 182` and *nothing in the schema ever wrote that
   column* — `0008` refreshes restaurant aggregates only. The screen divided the
   two and labelled it "Per delivery", rendering "₱2,840.00 lifetime, ₱15.60 per
   delivery" for a rider who had never earned anything. If a number has no
   writer, it is not a total, and dividing it still produces a confident lie.
2. **Do not backfill history you cannot reconstruct.** Deliveries completed
   before `0037` have a NULL `rider_payout`, so there is no trustworthy amount
   to record. Reconstructing one from a historical rate would recreate exactly
   the fiction the ledger removes. Start empty and let it fill forward.
3. **`enabled` RLS is not a privilege.** `0038` left `rider_payouts` on
   Supabase's default table grants, so an anon read reached PostgREST and came
   back `200 []` — RLS emptied it. Safe, but it relied on the policy being
   correct instead of the grant. `0039` revoked the privileges the way `0035`
   does for `order_offers`, so the request is refused outright.

**Not done, deliberately: the delivery-completion push.** The brief assumed
`lib/push.ts` "already supports it and the rider surface ignores it." Neither
half is true. `push.ts` is a *registration* client and is consumed only by the
customer `app/account.tsx`; the server has `sendMerchantOrderPush` and no rider
sender at all. On top of that `rider_mark_delivered` is a Postgres function, so
it cannot reach the Next route without `pg_net` + vault credentials. And the
alert is near-worthless: the rider just tapped the button and is looking at the
result. **The push worth building is new-offer alerts** — telling an idle rider
that an order appeared while they were in another app. That belongs to Phase 1's
dispatch surface, not here.

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
