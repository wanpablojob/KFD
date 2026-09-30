---
name: mobile-gap-analysis
description: Use when planning or scoping any mobile app feature work in KFD. Records what the mobile app currently does and does not do, and the Foodpanda-parity gap list with phase ordering, so plans are grounded in existing code instead of re-derived.
---

# Mobile gap analysis vs Foodpanda

Snapshot of `mobile/` as of `f1a3b4a`-era code, ~5,300 lines across 34 TS/TSX
files. Re-verify against the source before relying on any line claim below.

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

### Phase 4 — marketplace and rider operations

- Riders only see already-assigned orders. No available-jobs feed, no
  accept/decline, no claim. `rider_mark_delivered` and `rider_set_status` exist
  but nothing drives assignment.
- No delivery proof: no photo, no OTP, no customer signature.
- No in-app navigation or contact. No rider-to-merchant or rider-to-customer
  messaging, no call/chat deep link.
- No rider payout history. `earnings.tsx` renders lifetime totals off the
  `riders` row; no per-delivery ledger, no cash-out.
- No customer live location for the rider to follow.

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
