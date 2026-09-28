# KFD Admin — Code Review Fix Prompts

Generated from a senior-level review of the `admin/` Next.js app. Every prompt below is
**self-contained and copy-pasteable** — it repeats the context it needs so it can be run in a
fresh session without re-investigation.

## How to use

1. Run prompts **in phase order**. Phases are ordered by risk, not by importance.
2. Each phase ends with a **verification gate**. Do not start the next phase until the gate passes.
3. One commit per prompt. Never bundle two prompts into one commit.
4. Prompts marked **[DECISION REQUIRED]** have more than one legitimate solution. Read the
   decision section, pick, then run.
5. Section 8 (Manual Steps) contains work **no prompt can do** because it needs credentials.

### Phase map

| Phase | Theme | Prompts | Risk | Needs a product decision? |
|---|---|---|---|---|
| 0 | Finish in-flight realtime work | 0.1 | Low | No |
| 1 | Correctness & trust | 1.1 – 1.6 | Low | No |
| 2 | Data integrity | 2.1 – 2.5 | Medium | 2.4, 2.5 |
| 3 | Functionality gaps | 3.1 – 3.4 | Medium | 3.1, 3.3, 3.4 |
| 4 | Notification consolidation | 4.1 – 4.2 | Medium | 4.1 |
| 5 | Accessibility & responsive | 5.1 – 5.3 | Low | No |
| 6 | Mobile app & push | 6.1 – 6.2 | High | 6.2 |

---

## Block 0 — Shared context (referenced by every prompt)

Paste this understanding into any session before running a prompt, or rely on the prompt's own
restatement of these facts.

**Stack.** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4 (no `tailwind.config`;
theme tokens like `bg-card`, `text-muted-foreground`, `border-border`, `rounded-(--radius-card)`
come from CSS). Supabase via `@supabase/supabase-js` 2.117.1. **Only 8 runtime dependencies —
do not add any.**

**Working directory.** All paths are relative to `admin/`. Run commands from `admin/`.

**Security invariants — never violate these.**

- Row Level Security in PostgreSQL is the **only** security boundary. Client-side filtering is
  security theatre and is called out as such in `src/lib/supabase/merchant-queries.ts`.
- `SUPABASE_SERVICE_ROLE_KEY` must never appear in client code, `NEXT_PUBLIC_*` vars, or any
  file reachable by the browser bundle.
- `app_users` is the authority for roles (`admin` / `merchant`) and `restaurant_id` scoping.
- RLS helper functions are `stable` + `security definer` + `set search_path = public`. Any new
  function following the same pattern must keep all three properties.
- `NEXT_PUBLIC_SUPABASE_URL` must be the bare project URL, e.g.
  `https://ijeqwbrrgfsmymsektih.supabase.co` — **never** with `/rest/v1` appended. Getting this
  wrong silently breaks auth in production while working locally.

**Conventions to match.**

- `"use client"` on any component using hooks.
- Comments explain **why**, not what. Match the existing density; several files in this repo
  document non-obvious decisions and that is the house style.
- UI primitives live in `src/components/ui/` and are hand-rolled. No component library, no
  toast library, no `tailwindcss-animate` (so `animate-in` / `slide-in-from-bottom-2` do **not**
  exist — use plain `transition-*`).
- `cn()` from `@/lib/utils` for conditional classes.
- Migration naming: `supabase/migrations/00NN_snake_case.sql`, each starting with a
  `--`-delimited comment block explaining the reasoning. Applied migrations run **once and cannot
  be edited afterwards** — always add a new numbered migration.

**Verification commands (must all pass before committing).**

```bash
cd admin
npm run typecheck
npm run lint
npm run build
```

**Key API contracts.**

```ts
// src/lib/use-async-data.ts
useAsyncData<T>(fetcher: () => Promise<T>, key?: string | number)
  → { data: T | null; loading: boolean; error: string | null; refetch: () => void }
// Note: refetch does NOT flip loading to true. State keeps prior data until the new
// value resolves, so a refetch never blanks the page.

// src/lib/use-user-role.ts — the single source of role truth in the browser
useUserRole() → {
  role: AppRole | null; restaurantId: string | null; restaurantName: string | null;
  loading: boolean; provisioned: boolean; isAdmin: boolean; isMerchant: boolean; error: string | null;
}
// isMerchant is false while loading — use it to gate work that needs identity.

// src/lib/auth.ts
useSessionUser() → { user: User | null; loading: boolean }

// src/components/ui/table-boundary.tsx
<TableBoundary loading error onRetry skeletonRows? skeletonColumns? errorTitle?>{children}</TableBoundary>

// src/components/ui/stat-card.tsx
<StatCard kpi={{ label, value, delta, hint }} />
// `delta` is ALWAYS rendered with a TrendingUp/TrendingDown icon and a +/- sign,
// next to `hint`. It is a trend slot, not a free metric slot.

// src/components/ui/entity-dialog.tsx
<EntityDialog open title fields: DialogField[] initial? onClose onSave={(values) => Promise<void>} />
// DialogField = { key; label; type?: "text" | "number"; options?: readonly string[];
//                 required?: boolean; placeholder?: string }
// Mount with a `key` derived from the edited row so switching rows resets values.
// Required-field validation is built in. It has NO email/textarea field type.

// src/lib/csv.ts
downloadCsv(filename, rows, columns: CsvColumn<T>[]); timestampedFilename(base: string);
CsvColumn<T> = { key: keyof T; header: string; format?: (row: T) => unknown }

// src/components/ui/data-table.tsx
Column<T> = { key: string; header: string; cell: (row: T) => ReactNode;
              className?: string; align?: "left" | "right" }
// DataTable uses `key={rowIndex}` for rows. There is no row-selection support.

// src/lib/supabase/merchant-queries.ts
MerchantOrderStatus = Order["status"]            // = OrderStatus
allowedTransitions(status): MerchantOrderStatus[]
setOrderStatus(id, status): Promise<void>
saveMenuItem(id: string | null, input): Promise<void>   // null id = create
deleteMenuItem(id): Promise<void>
setMenuAvailability(id, available): Promise<void>

// src/lib/supabase/queries.ts (admin)
upsertRestaurant(input: RestaurantInput, existingId?: string): Promise<void>
upsertRider(input: RiderInput, existingId?: string): Promise<void>
upsertMenuItem(input: MenuItemInput, existingId?: string): Promise<void>
setMenuItemAvailable(id, available): Promise<void>
setRiderStatus(id, status: Rider["status"]): Promise<void>
// There is NO delete function for restaurants, riders, or customers.

// src/lib/types.ts
Order = { id; reference; customer; restaurant; items: OrderItem[]; subtotal; deliveryFee;
          total; status: OrderStatus; payment: PaymentMethod; placedAt: string; rider: string }
OrderStatus = pending | confirmed | preparing | out_for_delivery | delivered | cancelled
```

---

## Phase 0 — Finish the in-flight realtime work

> Uncommitted on `main` as of this review. Complete and commit before starting Phase 1,
> so later phases build on a clean tree.

````text
PROMPT 0.1 — Apply and verify the realtime orders migration, then commit

Context: I have already written and typechecked a Supabase Realtime feature in the KFD
admin app. It is uncommitted. Your job is to verify it end-to-end and commit it. Do NOT
rewrite it — only fix genuine defects you find.

Working directory: admin/

Already on disk, uncommitted:
  - supabase/migrations/0007_realtime_orders.sql
  - src/lib/use-order-realtime.ts
  - src/components/merchant/new-order-banner.tsx
  - modified: src/app/merchant/page.tsx
  - modified: src/app/merchant/orders/page.tsx

What it does: publishes the `orders` table to the `supabase_realtime` publication so the
merchant portal receives INSERT/UPDATE events over a websocket. Realtime is used purely as
a trigger to call the existing `refetch()` from `useAsyncData` — payload state is
deliberately NOT merged into React.

The migration publishes `orders` to the publication, guarded so it is re-runnable:
  do $$ begin
    if not exists (select 1 from pg_publication_tables
                   where pubname='supabase_realtime' and schemaname='public'
                     and tablename='orders') then
      alter publication supabase_realtime add table public.orders;
    end if;
  end $$;

TENANT ISOLATION: RLS applies to postgres_changes for authenticated subscribers. The
existing policy `scoped access: orders` from migration 0002_merchant.sql is
`using (is_platform_admin() or restaurant_id = current_merchant_restaurant())`, so each
merchant only receives their own restaurant's rows. The hook subscribes with the
authenticated browser client (`src/lib/supabase/client.ts`), never the service role.
Confirm this is still true — if the service role ever appears in a client-reachable file,
that is a critical finding and you must stop and report it.

STEPS:
1. Run `npm run typecheck`, `npm run lint`, `npm run build`. All must pass.
2. Read `src/lib/use-order-realtime.ts` and verify these three invariants, reporting on each:
   a. The subscription is gated on a boolean that is false until the role resolves, so the
      channel cannot open before the session is known. (Callers pass `isMerchant` from
      `useUserRole()`, which is false while `loading`.)
   b. The effect dependencies cannot cause a resubscribe loop. `onChange` is
      `orders.refetch`, a `useCallback` with a `[]` dep array, so it is referentially
      stable.
   c. The subscription does NOT include DELETE events. Supabase does not apply RLS to
      DELETE (Postgres cannot verify a subscriber may see a deleted row), so DELETE must
      be excluded or cross-tenant delete metadata leaks. Only INSERT and UPDATE are valid.
3. I cannot run the migration myself — I have no `SUPABASE_DB_PASSWORD`. Instead, give me
   the exact SQL from the migration file, formatted for pasting into the Supabase
   dashboard SQL Editor, and confirm whether `supabase db push` is possible if I supply a
   password. Do not attempt to connect to any database.
4. After I confirm the migration is applied, I will test manually. Write down the exact
   manual test I should run, covering: (a) a new order for the test merchant's restaurant
   `rst_05` produces a banner with no page reload; (b) an insert for a DIFFERENT
   restaurant_id produces NO event — this is the security check and is the one that
   matters most; (c) the banner auto-dismisses; (d) the page does not flash a full-page
   loading state when the refetch fires.
5. Once I confirm the tests pass, commit all five files as a single commit.

CONSTRAINTS:
- Do not add any dependency. The project has 8 and must stay at 8.
- Do not add a toast library.
- Do not set REPLICA IDENTITY FULL — consumers refetch the full list, so the old row
  version is never needed and FULL only adds WAL overhead.
- Do not edit any already-applied migration (0001–0006). Only 0007 is new.

VERIFY: npm run typecheck && npm run lint && npm run build — all clean.
````

---

## Phase 1 — Correctness & trust

> No product decisions required. Every item here is a defect with one correct fix.
> Ship these first: highest value per unit of risk.

````text
PROMPT 1.1 — Give the merchant pages a real error surface

DEFECT: None of the four merchant pages handle a failed fetch. Confirmed by grep — no
file under src/app/merchant/ ever reads `.error` from `useAsyncData`.

Admin pages wrap content in <TableBoundary> (loading / error / skeleton / retry). Merchant
pages instead do:

  if (orders.loading || menu.loading) return <LoadingState … />;

On failure, `loading` is false, `data` is null, `error` is set and never read. The result is
that a merchant sees "Nothing waiting" — visually identical to genuinely having no orders.
During an outage a merchant would reasonably believe they are safe. This is the highest
impact merchant bug in the codebase.

AFFECTED FILES (all four):
  - src/app/merchant/page.tsx        (dashboard: 2 fetches, orders + menu)
  - src/app/merchant/orders/page.tsx (1 fetch)
  - src/app/merchant/menu/page.tsx   (fetches menu items)

REQUIREMENTS:
1. Use the existing <TableBoundary> component. Do not build a new error component and do
   not add a dependency. Its props are:
     loading: boolean; error: string | null; onRetry: () => void;
     skeletonRows?: number; skeletonColumns?: number; errorTitle?: string; children
2. Every fetch's `error` must reach TableBoundary. Where a page has two fetches, combine
   them the way the admin dashboard already does:
     const error = orders.error ?? menu.error;
3. REMOVE the early-return `<LoadingState>` pattern from these pages and let TableBoundary
   own the loading state. This matters: a duplicated loading branch is how the error branch
   got lost in the first place. If you keep a local loading guard, prove that the error
   branch is unreachable-dead — prefer removing it.
4. `onRetry` must be the relevant `refetch`. For a page with two fetches, the retry handler
   must refetch everything the page renders, not one of the two.
5. Give each page a specific `errorTitle`, e.g. "Could not load your orders". Do not reuse
   one generic string across all pages.
6. The merchant dashboard currently gates the whole page on `orders.loading || menu.loading`.
   After the change, `deriveStats` must never run against `null` data without the `?? []`
   guards it already has. Verify the empty states still render correctly.
7. The merchant layout (src/app/merchant/layout.tsx) wraps pages in <MerchantGate>. Confirm
   your change does not interfere with the gate's redirect-on-unauthorised behaviour.

ACCEPTANCE CRITERIA:
- Simulating a failed fetch (e.g. temporarily pointing at a bad table name, or blocking
  network in devtools) shows an error state with a working Retry button on all 3 pages.
- No merchant page contains a bare `if (loading) return` that can mask an error.
- Empty state, loading state, and error state are all visually distinct.

VERIFY: npm run typecheck && npm run lint && npm run build
DESCRIBE: how you verified the error state actually renders, not just that types pass.
````

````text
PROMPT 1.2 — Clamp pagination when the filtered set shrinks

DEFECT: src/components/ui/paginated-data-table.tsx

  const pageRows = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

`page` is reset to 1 only when the *query* changes (the `previousQuery` effect at line 37).
It is never reset or clamped when `filtered` shrinks — for example after deleting a row on
the Restaurants or Menu Items page and refetching, or when the parent passes a smaller
`rows` array.

Result: if you are on page 3 of 3 and the last page loses its only row, `pageRows` is
empty, `filtered.length` is still > 0, so EmptyState does not render. The user sees a table
header with an empty body and a footer reading "17–17 of 17".

Note that src/components/ui/pagination.tsx computes totalPages and disables Previous/Next
correctly, but it only *disables* buttons — it never corrects an out-of-range `page` value.

REQUIREMENTS:
1. Clamp `page` to the valid range whenever `filtered` changes. Compute
   `const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))` and ensure
   `page` never exceeds it.
2. Follow the React rules: do not call `setState` unconditionally during render. The file
   already uses the "adjust state during render when a prop changes" pattern at lines 37–42
   (`previousQuery` / `setPreviousQuery`). Either extend that existing pattern for
   pagination, or clamp at render time without state mutation. Pick whichever is cleaner
   and explain why in a comment — this codebase documents non-obvious decisions.
3. The clamp must also fire when the parent replaces `rows` (refetch after a delete), not
   only when the query changes.
4. Do not change the shared <Pagination> component's public props — it is used elsewhere.
5. The record count text ("N records") and the footer range must stay consistent with what
   is actually displayed.
6. Add a brief comment explaining the failure mode this prevents.

ACCEPTANCE CRITERIA:
- On a 3-page table, delete the only row on page 3, and the user lands on page 2 (or
  whichever is now last) showing real rows — never an empty table with a populated footer.
- Searching resets to page 1 (existing behaviour must not regress).
- No React "setState during render" warning appears in the console.

VERIFY: npm run typecheck && npm run lint && npm run build
DESCRIBE: the exact sequence you used to reproduce the empty-table state before the fix.
````

````text
PROMPT 1.3 — Require a rejection reason

DEFECT: src/components/merchant/order-actions.tsx

The component's own doc comment states the intent:

  "The reason is not persisted (orders has no column for it) but is shown to the customer
   in the email, so a rejected order is never unexplained. That is the whole reason the
   dialog exists rather than a bare button."

The reject dialog's body text says: "The customer is emailed right away. Give a reason so
the rejection is not unexplained."

But the reason is never required. Line 83:
  const rejection = target === "cancelled" ? reason.trim() : undefined;

`reason.trim()` may be `""`. An empty string is falsy, so `notifyOrder(orderId,
"status_changed", "")` is called and the customer receives a rejection email with no
explanation — exactly the outcome the component claims to prevent. The "Reject order"
button is never disabled and the <Textarea> has no `required` attribute.

REQUIREMENTS:
1. A merchant must not be able to reject an order without a reason.
2. Disable the "Reject order" button in the dialog while the trimmed reason is empty, and
   give the disabled state a clear affordance. A bare disabled button with no explanation
   is a UX failure — include helper text such as "Add a reason to continue".
3. Also enforce it in `apply()`: if the target is `cancelled` and the reason is empty, set
   the error state and return early. Never rely on the disabled button alone, because
   `apply` is also reachable from other code paths over time.
4. Clear the error and the reason appropriately when the dialog opens and closes so a stale
   validation message cannot persist.
5. The `notifyOrder` signature in src/lib/merchant-notify.ts takes
   `reason?: string`. An empty string should never be sent. Make that unrepresentable
   where cheap, or at minimum assert it cannot be `""` at the call site.
6. Add a `maxLength` of 280 to the <Textarea> and a live character counter. This matches
   the server-side cap already enforced by /api/orders/notify, so the UI and API agree.
7. Do NOT persist the reason in this prompt. A migration to store it is Prompt 2.5 — that
   is a separate, larger change. Add a code comment pointing at Prompt 2.5 so the next
   reader knows the reason is still ephemeral.

ACCEPTANCE CRITERIA:
- The "Reject order" button is disabled with an empty or whitespace-only reason.
- Forcing the call path with an empty reason produces a visible error, not a silent send.
- The counter and the server cap both read 280.
- Accept / other status transitions are entirely unaffected — no reason is demanded for
  confirm, preparing, or out_for_delivery.

VERIFY: npm run typecheck && npm run lint && npm run build
DESCRIBE: how you proved the empty-reason path cannot send an email.
````

````text
PROMPT 1.4 — Stop showing raw JSON to merchants

DEFECT: Two files conspire to render a JSON blob in the UI.

src/lib/merchant-notify.ts, line 31:
  return { ok: res.ok, detail: JSON.stringify(body) };

src/components/merchant/order-actions.tsx, line 86:
  setError(`Saved, but the customer email failed: ${notice.detail}`);

If Resend rejects, the merchant reads:
  Saved, but the customer email failed: {"error":"API key is missing"}

An API key being missing is an operator problem, not a merchant problem, and a merchant
cannot act on either. More importantly it looks like a bug in the product.

REQUIREMENTS:
1. The user-facing message must be a short, human, actionable sentence. For example:
   "Order saved, but we could not email the customer. Ask an administrator to check the
   email settings." Keep it under ~120 characters.
2. Never surface the raw response body, a stack trace, a provider name, or a secret to the
   browser.
3. The technical detail must still reach the operator. Options in preference order:
   a. `console.error` with structured context on the client (orderId, status, status code);
   b. `console.error` client-side plus a server-side log in the notify route;
   c. both.
   Do not invent a new telemetry dependency. This project has 8 dependencies and must stay
   at 8.
4. Distinguish the failure classes in the client message where it changes what a human
   should do. A 401/403 (misconfigured credentials) and a 429 (rate limited) warrant
   different words than a generic 500. A small map from status code to message is fine.
5. Keep the existing correct behaviour intact: a failed email must NOT roll back the saved
   order status, and the error must not be presented as a failed status change. The
   current copy already distinguishes these — preserve that distinction.
6. `notifyOrder` is documented as "best-effort by design… The outcome is logged rather than
   thrown." Keep that contract. Change the *shape* of `detail`, not the error handling.

ACCEPTANCE CRITERIA:
- No raw JSON, provider name, or secret can reach the rendered UI on any failure path.
- A merchant sees a sentence a non-technical person can understand.
- The order status is still persisted when email fails.
- The order still refreshes (`onChanged()` is still called).

VERIFY: npm run typecheck && npm run lint && npm run build
DESCRIBE: the exact failure paths you traced, and how you confirmed no raw body escapes.
````

````text
PROMPT 1.5 — Source the displayed role from app_users, not user_metadata

DEFECT: src/components/sidebar.tsx:120 and src/components/topbar.tsx:93 both render:

  {user?.user_metadata?.role ?? "Super admin"}

`user_metadata` is **writable by the user** via `supabase.auth.updateUser()`. It is a
free-text bag, not an authority. The real role lives in `app_users.role`, resolved by
`useUserRole()`.

Two concrete problems:
  1. A user can set their own metadata role to "Super admin" and the UI will display
     "Super admin" while the database still correctly denies them everything. The console
     asserts an authority the database does not grant. A security review will flag this.
  2. The `?? "Super admin"` fallback labels *any* user whose metadata lacks a role as a
     super admin — including a brand-new merchant with empty metadata.

REQUIREMENTS:
1. Replace both with the real role from `useUserRole()`. It returns `role`
   ("admin" | "merchant" | null), plus `isAdmin` / `isMerchant` / `loading`.
2. Never label an unresolved or unknown role as an elevated one. The safe default for
   `role === null` is a neutral label such as "Signed in" — or render nothing — not
   "Super admin".
3. Render human labels: "Administrator" and "Merchant". Map in a small record, mirroring
   the style of `statusMap` in src/components/ui/status-badge.tsx. Do not print the raw
   enum if it is snake_case.
4. Handle the `loading` state so the label does not flash between two values while the
   role resolves. A brief stable placeholder is better than a flicker.
5. Both components already call `useSessionUser()` for the display name. You are adding a
   second hook call for the role — make sure that is not a redundant fetch. Note that
   `useUserRole()` internally calls `useAsyncData(() => fetchUserRole(), userId)`. Check
   whether calling it in both Sidebar and Topbar causes duplicate network requests. If it
   does, hoist the single call into `AppShell` (src/components/app-shell.tsx) and pass the
   resolved role down as a prop. Prefer whichever avoids duplicate fetching, and say why
   in a comment.
6. Do not change auth, RLS, or the role resolution logic in src/lib/role.ts. This prompt is
   strictly about what the UI *displays*.

ACCEPTANCE CRITERIA:
- The displayed role always matches `app_users.role` for the signed-in account.
- A user who edits their own `user_metadata.role` sees no change in the UI, and gains
  nothing — verify the UI is not merely reflecting what it always was.
- No code path renders "Super admin" for a null or unknown role.
- No duplicate `fetchUserRole` network call per page load.

VERIFY: npm run typecheck && npm run lint && npm run build
DESCRIBE: confirm whether you hoisted the hook and why, and how you checked for duplicate
fetches.
````

````text
PROMPT 1.6 — Replace the inline hamburger SVG with the icon system

DEFECT: src/components/topbar.tsx lines 41–51 contain a hand-inlined <svg> element for
the mobile navigation toggle, even though the project maintains a hand-rolled icon
library at src/components/ui/icons.tsx (257 lines, including BellIcon, SearchIcon,
XIcon, LogOutIcon, MapPinIcon and more).

Two issues:
  1. Inconsistency — every other icon comes from the icon module, so this one is
     inconsistently inline.
  2. The inline <svg> has no `aria-hidden="true"`. Screen readers may announce it as an
     unlabelled graphic, duplicating the button's own `aria-label="Open navigation"`.

REQUIREMENTS:
1. Add an icon to src/components/ui/icons.tsx that matches the existing conventions
   exactly — same props signature, same className handling, same stroke styling as its
   siblings. Read three or four existing icons in that file and mirror them precisely.
   Call it something consistent with the existing naming (the file uses names like
   `SearchIcon`, `XIcon`, `BellIcon` — a `MenuIcon` fits).
2. Replace the inline SVG in topbar.tsx with the new icon.
3. Confirm the button still has `aria-label="Open navigation"` and that the icon is
   `aria-hidden` if the icon component does not already set it. Match whatever the
   existing icon components do — do not introduce a second convention.
4. While you are in icons.tsx, check whether every exported icon already sets
   `aria-hidden`. If some do and some do not, make it consistent. Do not add an
   `aria-hidden` prop to the shared Icon type; apply it at call sites if needed.
5. Do not add a dependency. This is not the moment to install an icon package.

ACCEPTANCE CRITERIA:
- No inline `<svg>` remains in topbar.tsx.
- The new icon is visually identical to the SVG it replaced.
- The toggle still opens the sidebar and is announced correctly to a screen reader.

VERIFY: npm run typecheck && npm run lint && npm run build
DESCRIBE: which existing icons you used as the pattern reference, and what conventions
they share.
````

### Phase 1 verification gate

```bash
cd admin
npm run typecheck && npm run lint && npm run build
```

Manual checks in the browser before moving on:

1. Block the network in devtools, load each of the 3 merchant pages, confirm an error
   state with a working Retry appears (Prompt 1.1).
2. On a multi-page admin table, delete the only row on the last page (Prompt 1.2).
3. Open a merchant reject dialog, confirm the button is disabled with an empty reason
   (Prompt 1.3).
4. Compare the role label in the sidebar against your actual `app_users.role` (Prompt 1.5).

---

## Phase 2 — Data integrity

> **[DECISION REQUIRED] in 2.4 and 2.5.** Read the decision section before running those.
> 2.1–2.3 are mechanical and can be run immediately.

````text
PROMPT 2.1 — Make dashboard KPIs internally consistent about their time window

DEFECT: src/app/(dashboard)/page.tsx

  const grossRevenue = orderRows.reduce((sum, o) => sum + o.total, 0);   // ALL TIME
  …
  { label: "Gross Revenue", value: formatCurrency(grossRevenue),
    delta: periodDelta(deltas.revenue.current, deltas.revenue.previous),  // LAST 7 DAYS
    hint: "vs prev 7 days" }

"Total Orders" has the identical problem (line ~123).

The headline number and the trend arrow beside it describe different time periods. A
number that went up 40% "vs prev 7 days" while the figure itself is all-time is
incoherent, and nobody can reason about it correctly.

REQUIREMENTS:
1. Pick ONE consistent window and apply it to every KPI whose delta is a period
   comparison. The recommended choice is to make the *value* match the existing
   "vs prev 7 days" hint — i.e. the value becomes last-7-days too, so value and delta
   describe the same period. Choose deliberately and justify it in a comment.
2. Apply the same treatment to every KPI in the `kpis` array. There must be no remaining
   case where `value` covers a different period than `delta` and `hint` imply.
3. Label each KPI so the window is explicit in the UI, e.g. "Gross revenue (7d)" or keep
   the label short and put the window in `hint`. The current hint slot is occupied by the
   comparison text, so decide how the window surfaces without collision.
4. Do NOT change the layout, the StatCard component, or the `Kpi` type shape
   (`{ label, value, delta, hint }`) unless a field is genuinely required — prefer
   encoding the window in the existing strings.
5. Reuse the existing `splitPeriods` helper. Do not write a second date-windowing
   function. If it needs extending, extend it in place.
6. Preserve the existing division-by-zero guard in `periodDelta` — it correctly returns 0
   when the previous period is empty rather than rendering Infinity. Keep that behaviour.
7. Make sure empty datasets (no orders at all) render sensibly: 0 values, no NaN, no
   Infinity, and no crash.

ACCEPTANCE CRITERIA:
- For every KPI, the value, the delta, and the hint text all describe the same period.
- Zero orders renders cleanly with no NaN or Infinity anywhere.
- `periodDelta` still guards division by zero.

VERIFY: npm run typecheck && npm run lint && npm run build
DESCRIBE: state the window you chose, why, and show the before/after for each KPI.
````

````text
PROMPT 2.2 — Fix the revenue chart's date range and weekday duplication

DEFECT: `buildRevenueSeries` in src/app/(dashboard)/page.tsx (lines ~285–307).

  const key = date.toDateString();                       // "Mon Sep 28 2026"
  const entry = days.get(key) ?? { label: formatter.format(date), … };
                                                             // label = "Mon"
  …
  const labels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  for (const label of labels) {
    if (!points.some((p) => p.label === label)) points.push({ label, orders: 0, revenue: 0 });
  }
  return points.sort((a, b) => labels.indexOf(a.label) - labels.indexOf(b.label));

It buckets by full date across **all** orders, then labels each bucket with a weekday
abbreviation, then sorts by weekday index.

Two bugs:
  1. The chart's subtitle says "last 7 days" but it plots every order that has ever
     existed.
  2. Once the dataset spans more than a week, several distinct dates share the same
     weekday label. You end up with roughly four entries labelled "Mon", four "Tue", and
     so on, all clustered together by the sort. The chart shows ~30 bars with repeated
     day labels instead of 7.

REQUIREMENTS:
1. Filter to the intended window (last 7 days, matching PERIOD_DAYS and the subtitle)
   BEFORE bucketing. Discard orders outside it.
2. Bucket by actual calendar date, then emit exactly 7 points, one per day, in
   chronological order. Zero-revenue days must be present as 0 rather than omitted, so
   the line has no gaps.
3. Labels must be derived from the date, not accumulated into a Map keyed by a
   collision-prone weekday string. Build the 7-day sequence first (e.g. from the oldest
   day in the window forward), then sum each day's orders into it.
4. Order the points oldest → newest. The current weekday sort produces calendar-week
   order (Mon→Sun) rather than chronological order, which is different from "last 7
   days".
5. Keep the shape the existing <RevenueChart data={…} /> expects — it takes
   RevenuePoint[] = { label: string; orders: number; revenue: number }. Do not change
   the component's props unless you must, and if you do, say why.
6. Use the same time boundary convention as the rest of the page. Note that
   `splitPeriods` uses rolling windows from `Date.now()`; a local-midnight calendar window
   is also acceptable but pick ONE and do not mix them silently. Document the choice.
7. Handle the edge cases: zero orders in the window (7 zero points, chart renders empty
   rather than crashing), and a window that spans a month boundary.
8. Do not add a charting dependency. The project must stay at 8 dependencies.

ACCEPTANCE CRITERIA:
- The chart always renders exactly 7 points, oldest first.
- Days with no orders render as zero, not as a gap.
- The plotted range matches the subtitle text.
- No two points share a label.

VERIFY: npm run typecheck && npm run lint && npm run build
DESCRIBE: show the 7 labels the function now returns for a dataset that spans 30 days
across multiple months. Paste the actual output.
````

````text
PROMPT 2.3 — Fix the "Riders Online" KPI abusing the trend slot

DEFECT: src/app/(dashboard)/page.tsx, in the `kpis` array:

  { label: "Riders Online", value: onlineRiders.toString(),
    delta: deliveredRate, hint: "delivery success rate" }

<StatCard> renders `delta` as a signed percentage with a TrendingUp or TrendingDown icon
and a colour, immediately left of `hint`. This is a trend slot.

You are passing a *level* (the delivery success rate) into it. The card renders:

  Riders Online
  3
  ↑12%  delivery success rate

Three problems:
  1. A "success rate" is not a delta — it has no previous period, so the direction arrow
     and the green/red colour are meaningless and actively misleading. A 0% success rate
     would render as "↓0%" in red.
  2. The number 12% is unrelated to the value 3 sitting directly above it.
  3. The label "Riders Online" promises a count; the badge beside it reports a rate.

REQUIREMENTS:
1. Make the card honest. Two acceptable outcomes — choose one and justify it:
   a. Give "Riders Online" a real delta by comparing online-rider count against the
      previous 7 days, mirroring how the other KPIs work, with hint "vs prev 7 days".
      This requires the previous period's rider data, which means extending
      `splitPeriods` to include riders. Note that <Rider> has a `status` field but NO
      timestamp — check the schema before assuming a historical count is derivable. If
      no time dimension exists on riders, this option is NOT available.
   b. Keep "Riders Online" as a pure count with no trend, and surface the delivery success
      rate as its own separate card with an honest label such as "Delivery success" and a
      neutral presentation. This requires <StatCard> to support a KPI with no delta.
2. Do not leave an unrelated metric in the trend slot. Whatever you choose, no KPI may
   show a trend arrow next to a number it does not describe.
3. If you need <StatCard> to support an optional delta, make `delta` optional in the `Kpi`
   type (`src/lib/types.ts`) and render the trend block conditionally. Grep for every
   <StatCard> consumer first — the merchant dashboard also uses it via a local `stat()`
   helper — and confirm all call sites still compile and look correct with an absent delta.
4. Keep the four-card grid. Do not change <StatGrid> or the layout.

ACCEPTANCE CRITERIA:
- No KPI shows a trend arrow beside a metric the arrow does not describe.
- Every rendered percentage is a genuine period-over-period change or is clearly
  presented as a level, not a trend.
- All existing <StatCard> call sites still work.

VERIFY: npm run typecheck && npm run lint && npm run build
DESCRIBE: which option you chose, what you found in the riders schema, and why.
````

````text
PROMPT 2.4 [DECISION REQUIRED] — Make customer and restaurant aggregates real, or stop
          implying they are

DEFECT — the most serious data-integrity issue in the codebase.

These columns are written once by seed inserts and NEVER recomputed:

  customers.orders_count   — seeded at supabase/migrations/0001_init.sql:182
  customers.total_spend    — seeded at supabase/migrations/0001_init.sql:182
  restaurants.orders_count — seeded at supabase/migrations/0001_init.sql:165
  restaurants.revenue      — seeded at supabase/migrations/0001_init.sql:165

Verified: the entire migrations directory contains exactly TWO functions
(`is_platform_admin` and `current_merchant_restaurant`, both RLS helpers) and ZERO
triggers. src/lib/supabase/queries.ts reads these columns straight through
(`ordersCount: Number(c.orders_count)`, `totalSpend: Number(c.total_spend)`, etc.).

Consequences the UI currently hides:
  - Customers page: "Total spent", "Orders", and the Gold/Silver/Standard tier badges
    (derived from totalSpend) are all frozen seed values.
  - Dashboard: "Top restaurants — By gross revenue this month" sorts by `r.revenue`,
    a frozen number, while the card is labelled "this month".
  - src/app/(dashboard)/page.tsx:173 renders a **"Live"** badge next to the revenue card
    in the same view that displays these frozen figures.

The console looks authoritative and is quietly wrong, which is worse than showing
nothing.

BEFORE YOU START — investigate and report, do not assume:
  - The `orders` table has NO foreign key to customers. `orders.customer` is a free-text
    name (`text not null`). So "customer total spend" cannot be computed by joining on an
    id — it would have to match on name, which is unreliable. Verify this before
    proposing any aggregate.
  - The `restaurants` table has `revenue`, but `orders` links to restaurants only via
    the free-text `orders.restaurant` name. Migration 0002 added a real
    `orders.restaurant_id` column, so restaurant-level aggregation IS feasible. Confirm.
  - Decide whether aggregate correctness is in scope for this phase at all, or whether
    the honest interim fix is sufficient.

OPTIONS — pick one:

  OPTION A (make them real, recommended if orders data is about to go live)
    Add a new migration — take the next free `00NN` number, verified with
    `ls supabase/migrations/` — named `00NN_aggregate_refresh.sql`, with trigger
    functions on `orders`
    that maintain `restaurants.orders_count` and `restaurants.revenue` on INSERT / UPDATE /
    DELETE, and a backfill statement that recomputes from existing rows. Use `on
    conflict`-safe UPDATE ... FROM aggregates rather than row-by-row loops. Backfill
    restaurants FIRST, then wire the trigger, and make the function `stable` where
    possible.
    For customers: because there is no FK, either (i) add `orders.customer_id uuid
    references auth.users(id)` and backfill by name match with a report of unmatched
    rows, or (ii) compute customer aggregates from the `customers` table only and stop
    deriving tiers from them. Do NOT silently join on a name.
    Then update the customer/restaurant queries to read the maintained columns and
    confirm the dashboard no longer labels stale data as live.

  OPTION B (stop implying accuracy, cheaper and honest today)
    Do not change the schema. Instead:
    - Remove the "Live" badge from the revenue card, or scope it to the chart only,
      which genuinely is computed from live `orders` rows.
    - Relabel "Top restaurants — By gross revenue this month" to remove the false time
      claim, or add a visible "sample data" affordance.
    - On the Customers page, mark totalSpend/ordersCount/tier as illustrative if they
      cannot be made real, so an operator is never misled.
    - Add a code comment at queries.ts recording that these are seed-time constants and
      naming this prompt, so the next reader does not trust them.
    - Write a short entry in admin/SETUP.md under a "Known data limitations" heading.

REQUIREMENTS FOR BOTH OPTIONS:
1. Migrations are immutable once applied. Add a NEW numbered migration; never edit
   0001–0007.
2. Never expose the service role to the browser. Aggregates must be maintained in the
   database, not by a client-side recompute.
3. Do not break RLS. If you add triggers, the trigger function must run as a privileged
   role but must not weaken the read policies.
4. Do not change the 8-dependency count.

ACCEPTANCE CRITERIA:
- Every number displayed as a business metric is either computed from live data or is
  visibly labelled as sample/illustrative. No silent staleness.
- If Option A: deleting or cancelling an order updates the affected aggregate.
- If Option B: no UI element claims a freshness or time window the data does not have.

VERIFY: npm run typecheck && npm run lint && npm run build
REPORT FIRST: your recommendation between A and B, with the FK evidence you gathered.
Then implement only the option you recommend and say which you chose.
````

````text
PROMPT 2.5 [DECISION REQUIRED] — Persist rejection reasons

DEFECT: src/components/merchant/order-actions.tsx documents the gap in its own header:

  "The reason is not persisted (orders has no column for it) but is shown to the
   customer in the email, so a rejected order is never unexplained."

The `orders` table has no rejection-reason column. A merchant can reject an order with a
reason that is emailed to the customer and then **lost forever**. An administrator
reviewing a disputed or abused order has no way to see what the restaurant said, and the
merchant has no record that they gave a reason at all.

REQUIREMENTS:
1. New migration. **First run `ls supabase/migrations/` and take the next free `00NN`
   number** — do not assume `0008` or `0009` is free, because Phases 2.4 and 3.4 may
   already have claimed them. Name it `00NN_rejection_reason.sql`:
   - `alter table orders add column if not exists rejection_reason text;`
   - Add a CHECK constraint capping the length at 280 characters, matching the existing
     server-side cap in /api/orders/notify so the database, the API, and the UI all agree.
     Guard the constraint so re-running the migration is safe.
   - `comment on column orders.rejection_reason` with a short explanation.
   - Consider a partial index only if a query will actually filter on it. Do not add
     speculative indexes.
2. Extend `setOrderStatus` in src/lib/supabase/merchant-queries.ts to accept an optional
   reason, and write it **in the same UPDATE** as the status change. Two round trips
   would allow a status change to succeed with the reason lost, which is the exact bug
   being fixed. Do not set the reason for non-cancelled transitions.
3. Add the field to the `Order` type in src/lib/types.ts as
   `rejectionReason: string | null`, and map `rejection_reason` in BOTH
   `fetchMerchantOrders` and the admin `fetchOrders` in src/lib/supabase/queries.ts. A
   field present in one mapper and missing from the other is exactly how this drifts.
4. Surface it in the admin order detail (src/components/order-detail.tsx) — display the
   reason when `status === "cancelled"`, and show a neutral "No reason recorded" when the
   reason is null, so the absence is visible rather than silently blank.
5. The /api/orders/notify route already receives the reason. Confirm it still validates
   the ≤280 cap and that persisting the reason does not change the email behaviour at all.
6. Seeded existing cancelled orders will have a null reason. Handle that gracefully in the
   admin UI (Prompt step 4) — do not backfill fabricated reasons.
7. Do not add a dependency. Do not edit migrations 0001–0008.

ACCEPTANCE CRITERIA:
- Rejecting an order with a reason persists it, visible to an admin viewing that order.
- The status change and the reason are written atomically in one statement.
- A reason over 280 characters is rejected by the database, not just the UI.
- Merchant and admin order mappers agree on the new field.
- Existing cancelled orders with a null reason render "No reason recorded" without error.

VERIFY: npm run typecheck && npm run lint && npm run build
NOTE: you cannot apply the migration — no SUPABASE_DB_PASSWORD is available. Produce the
SQL for me to paste into the Supabase SQL Editor, and say so explicitly.
````

### Phase 2 verification gate

```bash
cd admin
npm run typecheck && npm run lint && npm run build
```

Before continuing: confirm on the dashboard that every KPI's value and delta describe the
same period, and that the revenue chart renders exactly 7 chronologically-ordered points.

---

## Phase 3 — Functionality gaps

````text
PROMPT 3.1 [DECISION REQUIRED] — Fix or re-scope the global search

DEFECT: The topbar search input (src/components/topbar.tsx) has the placeholder:

  "Search orders, restaurants, riders…"

That promises cross-entity search. What actually happens: `useGlobalSearch()` in
src/lib/global-search.ts is a tiny module-level pub/sub store, consumed in exactly two
places — `src/components/ui/paginated-data-table.tsx:35` and
`src/components/order-list.tsx:99`. Both simply filter **the rows already loaded on the
current page** by string match.

So:
  - On /orders it filters orders. On /customers it filters customers. It never searches
    across entities.
  - On the Overview dashboard, which renders hand-written lists rather than a
    PaginatedDataTable, **typing does nothing at all**.
  - There is no results dropdown, no result counts, no keyboard navigation, and no way to
    jump to a different entity.
  - The search term persists when you navigate, silently filtering a different table.

The placeholder is a false promise, which is worse than having no search.

OPTIONS — pick one:

  OPTION A (build it properly, recommended)
    Implement real cross-entity search:
    - A `GlobalSearch` component rendered by the topbar, owning a results popover.
    - A debounced (200–300ms) query that runs against Supabase across orders,
      restaurants, riders, customers and menu items, returning a typed union of
      `{ entity, id, title, subtitle, href }` results.
    - Keyboard support: ArrowUp/ArrowDown to move, Enter to navigate, Escape to close,
      focus moved into the list on open and returned to the input on close.
    - Accessible: `role="combobox"` on the input, `aria-expanded`,
      `aria-controls`, `role="listbox"` / `role="option"`, and a live region announcing
      the result count.
    - Result rows are links to the relevant detail or list page, so Enter navigates.
    - Clear the query on navigation so it never filters a table the user did not expect.
    - Respect RLS: the search must go through the authenticated browser client so
      merchants only ever see their own rows. This is a hard requirement.

  OPTION B (scope the claim down, ~30 minutes)
    Make the placeholder honest and the behaviour predictable:
    - Change it to "Search this page…".
    - Hide or disable the input on pages that render no searchable table (the Overview
      dashboard), rather than accepting input that does nothing.
    - Clear the query on route change.
    - Add an inline search field to pages that need one but have no table.

REQUIREMENTS FOR BOTH:
1. The pub/sub store in global-search.ts is a module-level singleton with no SSR guard
   and no reset. If you keep it, add a `clearGlobalSearch()` export and call it on
   navigation. Note `getServerSnapshot` is currently aliased to `getSnapshot`, which
   means the server renders whatever the module-level `query` happens to be — verify
   this does not leak a previous visitor's search into a server-rendered page.
2. No new dependencies. No search library, no command-palette package. Debounce by hand
   with a `setTimeout` in a `useEffect` and clear it in the cleanup.
3. Do not add an index or a database search function. This is a small dataset; match
   with `ilike`. Do not build Elasticsearch.
4. Preserve `matchesQuery` — it is used by the tables and works correctly.

ACCEPTANCE CRITERIA:
- The placeholder accurately describes what the search does.
- Typing never produces a dead input on any page.
- Keyboard-only operation is possible end to end.
- A merchant's search never returns another restaurant's rows.

VERIFY: npm run typecheck && npm run lint && npm run build
DESCRIBE: which option you chose and why, and how you verified the RLS scoping of search
results.
````

````text
PROMPT 3.2 — Add delete / deactivate for restaurants and riders

DEFECT: src/lib/supabase/queries.ts exposes `upsertRestaurant`, `upsertRider`,
`upsertMenuItem`, `setRiderStatus`, and `setMenuItemAvailable`. There is **no delete
function for restaurants, riders, or customers**.

An operator therefore cannot remove a duplicate restaurant, a test rider, or a
deactivated merchant's business record through the UI. Removing a wrong row means opening
the Supabase table editor by hand. `restaurants.status` already supports
`"suspended"`, so deactivation is partly expressible; hard delete is not available at all.

REQUIREMENTS:
1. **Prefer soft delete for restaurants.** They are referenced by `orders.restaurant_id`
   and by `menu_items.restaurant_id`. Deleting a restaurant with order history would
   orphan rows and, under the existing RLS, could make historical orders unreadable to
   the merchant. Use `status = "suspended"` as the deactivation action. Verify the FK
   situation first and report what you find before choosing.
2. Riders have no such reference and can be hard-deleted, but confirm that with the
   schema before relying on it. If `orders.rider` is a free-text name like
   `orders.restaurant` was, note that deleting a rider does not touch past orders and
   that is expected.
3. Add `deleteRestaurant(id)` / `deleteRider(id)` or a single
   `deactivateRestaurant(id)` to src/lib/supabase/queries.ts, matching the exact style of
   the existing functions:
     const { error } = await supabase.from("restaurants").delete().eq("id", id);
     if (error) throw new Error(error.message);
4. Add UI on the Restaurants and Riders pages:
   - Restaurants: a "Suspend" / "Reactivate" action in the existing row action area.
   - Riders: a "Delete rider" action behind a confirmation dialog.
   - Reuse the existing <Dialog> from @/components/ui/dialog. Do not use
     window.confirm.
   - A destructive action must state what will happen and be irreversible to undo, in
     plain language, before the merchant clicks.
5. Every destructive action needs: a confirmation dialog, a disabled-while-pending state,
   and an error surface if the write fails. Follow the error-handling pattern in
   src/components/merchant/order-actions.tsx.
6. After a successful delete, call the page's `refetch()` so the table updates.
7. Consider whether the row you are about to delete should be identified by name in the
   confirmation text ("Delete Maria Santos?"), not just by id.
8. Do not add a dependency. Do not add a "restore" feature for hard-deleted riders — the
   prompt budget is spent on making the action safe, not on undo.

ACCEPTANCE CRITERIA:
- An operator can suspend a restaurant and reactivate it, with no orphaned orders.
- An operator can delete a rider after an explicit confirmation.
- Neither action is a single unconfirmed click.
- Both surface write failures instead of failing silently.

VERIFY: npm run typecheck && npm run lint && npm run build
REPORT: what the schema says about FK references, and why you chose soft vs hard delete
for each entity.
````

````text
PROMPT 3.3 [DECISION REQUIRED] — Build a merchant provisioning flow

DEFECT: `app_users` is the entire RBAC system — it maps an `auth.users` row to a role
(`admin` / `merchant`) and, for merchants, a `restaurant_id`. But there is no UI to
create those rows.

The only way to onboard a merchant today is to hand-write SQL. That is how
`supabase/migrations/0006_dev_merchant_login.sql` came to exist: a migration containing a
known-weak password (`TestPass123!`) for a real account attached to restaurant `rst_05`,
with a comment warning it must be rotated or deleted before the database carries real
data. Provisioning-by-migration is not a process that survives contact with a real
business.

REQUIREMENTS:
1. Add a "Merchant access" section to the admin console — a new route
   `src/app/(dashboard)/merchants/page.tsx` plus a sidebar entry, following the existing
   page conventions exactly (PageContainer, PageHeader, Section, TableBoundary,
   PaginatedDataTable, Card).
2. List existing `app_users` rows joined to `restaurants` for display: user id, email,
   role, restaurant name, and a created/attached timestamp if one exists. If no
   timestamp column exists, report that rather than inventing one silently.
3. Provide a form to attach an EXISTING `auth.users` row to a restaurant as a merchant.
   The form must take an email, look the user up, and refuse to proceed if no such
   account exists — with a clear message telling the admin to have the merchant sign up
   first. Do NOT create `auth.users` rows from this screen; account creation stays with
   Supabase Auth, and doing it here would mean handling password policies in application
   code.
4. Allow changing a merchant's restaurant assignment, and revoking a merchant's access
   (delete the `app_users` row). Revocation is the important one: it is how you offboard
   someone.
5. **Security requirements, non-negotiable:**
   - All writes go through RLS. Admin-only policies already exist; verify by reading
     migration 0002 before writing a single line. If `app_users` has no admin write
     policy, add one in a new migration rather than routing around RLS with the service
     role.
   - Never accept a `restaurant_id` or `role` from an unvalidated string. Resolve the
     restaurant from a validated selection and constrain `role` to the enum.
   - The service role must not appear in any file reachable by the browser.
   - Confirm that a merchant cannot reach this route: it must sit behind <AuthGate> in
     the `(dashboard)` group and additionally reject `role !== "admin"`.
6. Add an `00NN_*.sql` migration — again taking the next free number, verified with
   `ls supabase/migrations/` — **only if** the audit columns you need do not already
   exist. Prefer reading what is there. Do not edit existing migrations.
7. Update admin/SETUP.md: replace the "insert into app_users by hand" instructions with
   the new UI flow, and mark the `0006_dev_merchant_login.sql` test account as removable
   once a real merchant exists.

ACCEPTANCE CRITERIA:
- An admin can onboard, reassign, and revoke a merchant entirely through the UI.
- A non-admin cannot load or use the route, and the server refuses the writes.
- No path lets a merchant escalate their own role.
- SETUP.md no longer instructs anyone to hand-write app_users rows.

VERIFY: npm run typecheck && npm run lint && npm run build
REPORT FIRST: the exact RLS policies that exist on app_users after migration 0002, and
which one authorises this write. Do not proceed until you can state it.
````

````text
PROMPT 3.4 [DECISION REQUIRED] — Customer-facing order tracking

DEFECT: `orders` has **no link to a user account**:

  create table orders (
    id text primary key,
    reference text not null,
    customer text not null,      -- free-text NAME, not a user reference
    …
  )

Verified across all migrations: there is no `customer_id`, no `user_id`, no reference to
`auth.users`. A customer's total spend cannot be computed by joining on an id, because no
id exists — which is also why Prompt 2.4 cannot aggregate customers properly.

Consequence: there is no way to notify a customer, and no page for a customer to track
their order. The customer-facing side of the product does not exist.

SCOPE WARNING: this is the largest prompt in the document. It is a product feature, not a
bug fix. If you are not ready to build it, do not attempt it — run Prompts 1.1–5.3 first
and defer this.

REQUIREMENTS IF PROCEEDING:
1. Migration. **First run `ls supabase/migrations/` and take the next free `00NN`
   number** — Phases 2.4 and 2.5 may already have taken `0008` and `0009`. Name it
   `00NN_orders_customer_user_id.sql`:
   - `alter table orders add column if not exists customer_user_id uuid references auth.users(id);`
   - Index it (`create index if not exists orders_customer_user_id_idx …`) — unlike most
     speculative indexes, this one is justified because every customer-scoped query will
     filter on it.
   - Backfill by matching `orders.customer` against `auth.users` metadata, and **report
     the number of unmatched rows** rather than silently leaving them null. Do not
     fabricate matches.
   - Make the column nullable. Anonymous walk-in orders must remain valid.
2. RLS: add a policy allowing a customer to `select` only their own orders, alongside the
   existing merchant/admin policy. Write it `using (auth.uid() = customer_user_id)`.
   Include the new column in the existing `orders` grant to `authenticated`.
3. A public order-tracking page at `/track/[reference]`, which:
   - Looks the order up by its human `reference` (e.g. `KFD-1005`), not by the internal
     text `id`.
   - Shows status, items, total, and placed-at time. **Never** show the customer's
     address, other customers' data, or internal rider notes.
   - Requires no login, because many customers will be anonymous. This makes the RLS
     policy irrelevant to that path — so you must decide and document how a reference-
     based lookup avoids becoming an enumeration oracle. A human-readable reference with
     sufficient entropy is the usual answer; state the reasoning and the entropy
     assumption explicitly. If you cannot justify it, gate the page behind login and say
     so.
4. A hook or query for the customer order view, subscribing to realtime status changes —
   `useOrderRealtime` already exists for the merchant case and keys on `isMerchant`.
   Do not fork it blindly; generalise it if the shape genuinely generalises, and
   otherwise write a separate, clearly-named hook. Do not weaken the merchant gating to
   make one hook serve both.
5. Realtime requires the `orders` table to be in the `supabase_realtime` publication
   (migration 0007). Confirm it is, and that the new RLS policy also applies to
   `postgres_changes` — it will, because RLS is applied per subscriber.
6. Do not add a dependency. Do not build a customer account system, a cart, or checkout
   in this prompt.

ACCEPTANCE CRITERIA:
- A customer can see their own order's live status without an account.
- A customer cannot see another customer's order by guessing references.
- A merchant cannot see orders outside their restaurant (regression check — the
  existing RLS must not be weakened by the new policy).
- Anonymous orders continue to work with a null customer_user_id.

VERIFY: npm run typecheck && npm run lint && npm run build
REPORT FIRST: your entropy analysis for the reference-based lookup, and the backfill
unmatched-row count. Do not implement the page until you have stated both.
````

### Phase 3 verification gate

```bash
cd admin
npm run typecheck && npm run lint && npm run build
```

Manually exercise every new destructive or provisioning action at least once, including
its failure path.

---

## Phase 4 — Notification consolidation

````text
PROMPT 4.1 [DECISION REQUIRED] — Consolidate the two notification surfaces

DEFECT: There are now two unrelated notification mechanisms, and neither is a real
notification system.

(1) src/components/notification-bell.tsx — admin only, mounted in
    src/components/app-shell.tsx and passed to <Topbar bell={…} />. It derives "updates"
    by filtering the orders array to statuses `confirmed | preparing |
    out_for_delivery` and taking the first 6:

      const updates = orders.filter((o) => LIVE_STATUSES.includes(o.status)).slice(0, 6);

    So the "notification" is just "orders currently in flight", recomputed from the full
    orders list. Its unread state is a component-level `useState` (`seen`) that resets on
    every reload. Its list items are not focusable and not clickable, so nothing in the
    dropdown can be acted on.

(2) src/components/merchant/new-order-banner.tsx + src/lib/use-order-realtime.ts — the
    realtime insert alert I just added for merchants.

Neither knows about the other. The merchant portal has no bell; the admin has no realtime.

OPTIONS:
  OPTION A (unify on realtime, recommended)
    Make `NotificationBell` realtime-driven for admins too, and keep the merchant banner
    for its immediate, attention-grabbing case. Both subscribe to the same already-published
    `orders` table. Give admins a bell that reflects real change events rather than a
    derived view of in-flight rows, and persist unread state (Prompt 4.2).
  OPTION B (unify on a shared component)
    Extract one `useOrderNotifications` hook that owns: the realtime subscription, the
    list of recent changes, unread count, mark-as-read, and dismissal. Both the admin bell
    and the merchant banner become thin presentational views over it. Higher refactor
    cost, single source of truth.
  OPTION C (leave them separate, document the split)
    Accept that admin and merchant need different affordances. Add a comment at the top of
    each file explaining its scope and when to reach for the other. Lowest cost, but the
    duplication remains.

REQUIREMENTS FOR A AND B:
1. Realtime is a trigger to refetch, not a state source. Preserve that. Do not merge
   payloads into React state — the previous review specifically praised this, and it
   avoids stale-state and out-of-order bugs.
2. RLS applies per subscriber. An admin subscriber passes the `is_platform_admin()` branch
   of the existing policy; a merchant passes the `restaurant_id` branch. Never use the
   service role in a client-reachable file.
3. Do not subscribe to DELETE. Supabase does not apply RLS to DELETE events.
4. No new dependencies. No toast library, no notification SDK.
5. Preserve the existing `aria-live` announcements. Screen-reader users currently hear new
   orders; do not regress that.
6. Keep the "no notifications table" design decision. Deriving from orders rather than
   maintaining a notifications table is a deliberate and reasonable choice — say so in a
   comment, because the next reader will assume a table is missing.

ACCEPTANCE CRITERIA:
- Either one mechanism serves both surfaces, or the split is deliberate and documented.
- Unread state survives a page reload (or is explicitly acknowledged as ephemeral).
- RLS scoping is intact: no merchant sees another restaurant's activity.

VERIFY: npm run typecheck && npm run lint && npm run build
DESCRIBE: which option, and what specifically you preserved from the existing design.
````

````text
PROMPT 4.2 — Persist notification read state

DEFECT: src/components/notification-bell.tsx tracks unreadness in a local boolean:

  const [seen, setSeen] = useState(false);

It resets to "unread" on every page reload, so the indicator is meaningless across
sessions. An operator who has already triaged today's orders is nagged again on every
refresh.

REQUIREMENTS:
1. Choose a persistence strategy and justify it:
   a. `localStorage` — no schema change, survives reload, per-device, and correctly
      resets on a new device. Appropriate if the unread marker is advisory.
   b. A `notifications` table with a `read_at` column — correct if unread state is
      per-account and must agree across devices. Costs a migration and a write per read.
   c. A last-seen timestamp on `app_users` (`last_notification_seen_at timestamptz`) —
      cheapest account-scoped option, and a count-since-timestamp is easy to compute.
2. Whichever you choose, it must be **account-scoped, not just device-scoped**, if the
   unread marker is shown to more than one person sharing a device.
3. Guard against SSR: `localStorage` does not exist during server rendering. Read it
   inside `useEffect`, and render a stable initial state so the component does not
   hydrate-mismatch. Next.js will throw or warn on a mismatch — verify it does not.
4. Reset the marker when the user signs out, so the next person at the same browser does
   not inherit it.
5. The bell's `aria-label` is currently
   `Notifications, ${updates.length} active`. Make it reflect the actual unread count and
   keep it meaningful when the count is zero.
6. Do not add a dependency.

ACCEPTANCE CRITERIA:
- Unread state persists across a page reload.
- No hydration mismatch warning in the browser console.
- Signing out clears account-scoped state.

VERIFY: npm run typecheck && npm run lint && npm run build
DESCRIBE: the strategy chosen, why, and how you verified there is no hydration mismatch.
````

### Phase 4 verification gate

Confirm that an admin and a merchant on two different devices see only their own
notifications, and that a reload does not resurrect an already-read notification.

---

## Phase 5 — Accessibility & responsive

````text
PROMPT 5.1 — Skip link, main landmark, and aria-current

DEFECTS (all small, all real):

(a) src/components/app-shell.tsx:22 renders `<main className="flex-1">` with no
    `aria-label` and no `id`. A keyboard user must tab through the topbar controls and
    all six sidebar links on every single page load before reaching content. There is no
    skip-to-content link anywhere in the app.

(b) src/components/sidebar.tsx marks the active link purely visually, via
    `bg-primary text-primary-foreground`. There is no `aria-current="page"`, so assistive
    technology cannot tell the user where they are.

REQUIREMENTS:
1. Add a skip link as the first focusable element inside the app shell, before the
   sidebar and topbar:
   - Visually hidden until focused. Tailwind v4 idiom:
     `sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50
      focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-sm
      focus:shadow-lg`
     Verify `sr-only` / `not-sr-only` are available in this Tailwind v4 setup — check
     whether an existing file already uses them and copy that pattern exactly.
   - Text: "Skip to main content".
   - `href="#main"`.
2. Give the `<main>` element `id="main"` and `tabIndex={-1}` so focus actually lands on
   it when the link is followed. Without `tabIndex={-1}` the browser scrolls but does not
   move focus, and the next Tab continues from the top — which defeats the purpose.
3. Add `aria-current="page"` to the active sidebar link only. Keep the existing visual
   treatment unchanged. Apply it in the `navItems.map` callback in src/components/sidebar.tsx.
4. Verify the sidebar's `<nav>` has an accessible name, and that the merchant navigation
   (src/components/merchant/merchant-nav.tsx) has an equivalent active-state treatment. If
   the merchant nav has the same visual-only active state, fix it the same way.
5. Do not reorder the DOM in a way that changes tab sequence for sighted keyboard users
   beyond what the skip link requires.
6. No new dependencies.

ACCEPTANCE CRITERIA:
- The first Tab from page load reveals a visible "Skip to main content" link.
- Activating it moves focus into <main>, not just the scroll position.
- Every current page's nav link exposes `aria-current="page"`.
- The merchant nav matches the admin nav on active-state semantics.

VERIFY: npm run typecheck && npm run lint && npm run build
DESCRIBE: how you verified focus actually moves to <main> after activating the skip link.
````

````text
PROMPT 5.2 — Make the notification bell keyboard-accessible

DEFECT: src/components/notification-bell.tsx opens a dropdown on click and handles
Escape, but:

1. Focus is never moved into the panel. A keyboard user opens it and is still on the
   button; every subsequent Tab escapes to unrelated page content.
2. Focus is never returned to the trigger on Escape or on outside-click. Focus falls to
   `document.body` and the user's position in the page is lost.
3. There is no ArrowUp / ArrowDown navigation, no Enter activation, no
   `aria-activedescendant`.
4. The trigger has `aria-expanded` but no `aria-haspopup`, and the panel has no
   `role="menu"` / `aria-controls` / stable id linking the two.
5. The list items are plain `<li>` with a `<StatusBadge>`. They are not focusable and not
   clickable, so nothing in the dropdown can be activated at all — a mouse user cannot
   act on them either.

REQUIREMENTS:
1. The panel is a list of links, not a menu of commands. Use the correct pattern:
   trigger is a `<button aria-expanded aria-controls={panelId}>`; panel is a
   `<ul id={panelId}>` whose items are `<Link>` elements to the relevant order. Do NOT
   use `role="menu"` — that role implies arrow-key command semantics and screen-reader
   behaviour that a list of links does not provide. Getting this wrong is worse than
   leaving it alone.
2. On open, move focus to the first link in the panel. On Escape or outside-click, close
   and return focus to the trigger button.
3. Add `aria-live="polite"` to a visually-hidden region announcing the number of new
   notifications when the count changes while the panel is closed, so a user who never
   opens it is still informed. Do not announce on every render.
4. Each item should link somewhere useful — at minimum the admin orders page filtered to
   that order. If no per-order route exists, link to `/orders` and say so in a comment
   rather than leaving a non-interactive list item.
5. Keep the existing outside-click and Escape listeners. Add a `focusout` handler so
   tabbing past the last item closes the panel, and make sure it does not fight the
   focus-move-in logic (check `ref.current.contains(e.relatedTarget)` before closing).
6. Match the exact icon/button conventions already in the file. No new dependencies.

ACCEPTANCE CRITERIA:
- The panel is fully operable with the keyboard alone: open, navigate, activate, close,
  with focus in a sensible place at every step.
- Focus returns to the trigger on close.
- No ARIA role is misused.
- A new notification is announced to a screen-reader user who does not open the panel.

VERIFY: npm run typecheck && npm run lint && npm run build
DESCRIBE: the full keyboard sequence you tested, and where focus was at each step.
````

````text
PROMPT 5.3 — Make search reachable on small screens

DEFECT: src/components/topbar.tsx:53:

  <div className="relative hidden max-w-md flex-1 sm:block">

The global search input is hidden below the `sm` breakpoint and there is **no mobile
alternative** — no icon that opens a search sheet, no menu entry, nothing. An admin
checking orders on a phone has no way to search at all, and no indication that a feature
is missing.

Note the dependency: on the Overview dashboard the search does nothing even when visible
(Prompt 3.1). Fixing mobile search before the placeholder is honest means shipping a search
box that is reachable on mobile but still does nothing there. Resolve 3.1 first, or
explicitly reconcile the two.

REQUIREMENTS:
1. Below `sm`, provide a search affordance. Recommended: a search icon button in the
   topbar that opens a full-width overlay or a dropdown containing the same input,
   sharing one piece of state with the desktop input so the query stays consistent.
2. Both inputs must write to the same store (`setGlobalSearch`) and read
   `useGlobalSearch()`. One source of truth, two presentations. Do not duplicate the query
   state.
3. The overlay must be dismissible with Escape and by tapping the backdrop, must trap
   focus while open, and must return focus to the trigger on close — the same focus
   contract as Prompt 5.2.
4. Do not shrink the desktop search to fit; the current `max-w-md` desktop presentation
   is fine. This is about adding the missing small-screen path only.
5. Respect the topbar's existing height (`h-16`) and z-index stacking. The overlay must
   sit above the sticky topbar (`z-20`) and the sidebar (`z-40`) without covering the
   sign-out control on mobile.
6. No new dependencies. Do not use a native `<dialog>` element if the codebase already
   has a <Dialog> primitive — but note that the existing <Dialog> is desktop-oriented, so
   justify a bespoke overlay if you use one.

ACCEPTANCE CRITERIA:
- Search is reachable and usable at 375px width.
- The query stays in sync between the desktop and mobile presentations.
- The overlay traps and restores focus correctly.
- Nothing overlaps or clips at common widths (320, 375, 414, 768).

VERIFY: npm run typecheck && npm run lint && npm run build
DESCRIBE: which widths you checked, and how you verified focus behaviour in the overlay.
````

### Phase 5 verification gate

Run an accessibility pass on `/`, `/orders`, and `/merchant`:
tab through each page from a cold load, and confirm the skip link works, focus is never
lost, and no control is unreachable.

---

## Phase 6 — Mobile app & push

> High risk, large scope. Phases 1–5 deliver more value per hour of work. Consider whether
> these are needed before starting.

````text
PROMPT 6.1 — Give the mobile app a backend to talk to

CONTEXT: `mobile/` is a bare Expo scaffold. It currently contains only App.tsx, index.ts,
app.json, assets, and this dependency set:

  expo ~57.0.24, react 19.3.0, react-native 0.87.1
  expo-status-bar ~57.0.1

There is no `expo-notifications`, no `expo-device`, no navigation library, no Supabase
client, no auth, and no API layer. One file contains app code (App.tsx). Every route in
`admin/` is an admin console, login, or merchant page — there is no customer or merchant
mobile view.

REQUIREMENTS:
1. Do not scaffold a large application in one pass. This prompt is deliberately limited
   to the foundation that Prompt 6.2 depends on.
2. Add Supabase to the mobile app:
   - `@supabase/supabase-js` (match the version used in `admin/`: 2.117.1 — a single
     version across the monorepo avoids client skew).
   - Read the URL and publishable key from Expo public env vars, e.g.
     `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, added to
     `app.json` under `expo.extra` and read via `expo-constants`. Note that anything
     prefixed `EXPO_PUBLIC_` is embedded in the bundle and is therefore PUBLIC. Never
     put a service role key or any secret here.
   - The Project URL must be the bare project URL with **no `/rest/v1` suffix**. This
     exact mistake shipped to production once in the admin app and caused
     "Invalid path specified in request URL" on sign-in. Add a comment saying so.
3. Add email/password sign-in calling the same Supabase Auth endpoint the web app uses.
   Read `admin/src/lib/auth.ts` first and mirror its error handling — the web app
   deliberately returns generic credential errors ("Invalid email or password") to avoid
   user enumeration. Do not regress that by surfacing Supabase's raw auth errors, which
   distinguish "user not found" from "wrong password".
4. After sign-in, resolve the role with the same rule the web app uses: a row in
   `app_users` means authorised, no row means unprovisioned. Admin redirects to the
   console, merchant to the merchant area. Reuse the semantics; do not invent a second
   model.
5. Persist the session with `expo-secure-store`, not AsyncStorage, since this holds an
   auth token.
6. Do NOT add navigation, a restaurant list, or an orders screen in this prompt. Those are
   separate product work.

ACCEPTANCE CRITERIA:
- The app starts, signs in against the real Supabase project, and restores the session
  after a restart.
- No secret is embedded in the bundle. Verify by searching the built bundle.
- A wrong password and a non-existent email produce the same message.
- An unprovisioned user is refused, matching the web app.

VERIFY: npx tsc --noEmit in mobile/ (or whatever the project's typecheck command is —
read mobile/package.json scripts and use what is there; do not invent one).
DESCRIBE: how you verified no secret is in the bundle.
````

````text
PROMPT 6.2 [DECISION REQUIRED] — Add Expo Push for merchant alerts

CONTEXT AND RESEARCH FINDINGS — these are established facts, do not re-litigate them:

- Expo's push notification service is **free**. Expo's documentation states there is no
  cost associated with sending notifications through it. The limit is 600 notifications
  per second per project. There is no per-message charge, no monthly cap, and no
  1,000-user ceiling.
- `expo-server-sdk` handles throttling and retries automatically; the docs recommend
  relying on that rather than building it.
- Expo Push reaches **Expo / React Native apps**, native iOS and Android. It does not
  reach a desktop browser. So it complements the web merchant portal rather than
  replacing it: Realtime updates the open page, Expo Push reaches a closed app.
- This is why OneSignal is not needed. If the merchant app is Expo, Expo Push is free
  and adds no vendor.

PREREQUISITES: Prompt 6.1 must be complete and working first.

REQUIREMENTS:
1. Migration `000N_push_tokens.sql`:
   - `create table if not exists push_tokens (id text primary key, user_id uuid not null
     references auth.users(id) on delete cascade, token text not null unique,
     platform text not null, created_at timestamptz not null default now());`
   - Enable RLS. Users may `select` and `delete` only their own tokens. Admins may
     `select` all. No client-side insert policy is needed if tokens are written
     server-side.
   - Index `user_id`.
   - `on delete cascade` is required — a deleted auth user must not leave orphan tokens
     that keep receiving pushes.
2. Store tokens **server-side only**. The registration endpoint must:
   - Authenticate the caller and reject unauthenticated requests.
   - Overwrite on conflict (`upsert` on the unique `token`) so a device re-registering
     does not create duplicates.
   - Use the service role, and only in a server route. Never in the mobile bundle.
3. Client side:
   - `expo-notifications` and `expo-device` as dependencies.
   - Request permission with a real rationale before the OS prompt. Do not call
     `requestPermissions` on cold start.
   - Register for push, obtain the Expo push token, and POST it to the server endpoint.
   - Handle the token rotating: `expo-notifications` can issue a new token. Re-register
     when it changes, or the device goes silently deaf.
   - Do NOT assume success. Check the permission result and surface a state where the
     merchant can see whether push is on, because a silently-disabled merchant is exactly
     the failure this feature exists to prevent.
4. Server send path:
   - Look up tokens for the target user's restaurant.
   - Send via `expo-server-sdk` and let it handle batching, throttling, and retry.
   - Prune tokens that Expo reports as `DeviceNotRegistered`.
   - A failed push must never block or roll back the order write. Follow the existing
     best-effort contract in `admin/src/lib/merchant-notify.ts` and
     `/api/orders/notify` — status is saved first, notification second, and a failure is
     reported without unwinding the save.
5. Trigger: the new-order event. Note the current state — no application inserts production
   orders yet, so there is no live trigger. Wire the send into the same place the
   `placed` notification is raised in `/api/orders/notify`, and state clearly in a comment
   that nothing calls it until ordering goes live.
6. Do not add push for customers in this prompt. It depends on Prompt 3.4.

ACCEPTANCE CRITERIA:
- A merchant device registers exactly one token, and re-registering does not duplicate it.
- A push arrives on a real device with the app force-quit.
- Disabling the merchant's auth account revokes their tokens and stops delivery.
- A send failure leaves the order status correctly saved.
- No service role key appears anywhere in the mobile bundle.

VERIFY: the mobile project's typecheck, plus a physical-device test. Emulators do not
receive Expo pushes reliably — say so if you cannot test on hardware rather than claiming
it works.
DESCRIBE: the full device test you actually performed, and be explicit about anything you
could not verify without hardware.
````

---

## 7. Global guardrails

Apply to every prompt in this document.

1. **Never weaken RLS.** It is the only security boundary. If a feature seems to require
   routing around it, the feature is wrong, not the policy.
2. **Never put a secret in client code.** `SUPABASE_SERVICE_ROLE_KEY` and
   `VERCEL_TOKEN` are server-only. Nothing prefixed `NEXT_PUBLIC_` or `EXPO_PUBLIC_` is
   secret — assume anything in a client bundle is readable by the user.
3. **The Project URL is the bare project URL.** No `/rest/v1`. This exact error shipped to
   production once.
4. **Never edit an applied migration.** Add a new numbered file. Migrations `0001`–`0007`
   are applied to the live database.
5. **Eight dependencies, staying eight.** No toast library, no icon package, no charting
   library, no search library, no form library. The UI kit in `src/components/ui/` is
   hand-rolled on purpose.
6. **No `tailwindcss-animate`.** `animate-in`, `slide-in-from-*`, and `fade-in-*` do not
   exist in this setup. Use plain `transition-*`.
7. **Keep the realtime design.** Refetch on change; do not merge payloads into React
   state. Never subscribe to DELETE. Never use the service role in a client-reachable
   file.
8. **Comments explain why.** Match the density and tone of the existing code, which
   documents non-obvious decisions rather than restating the code.
9. **Generic auth errors stay.** Do not surface Supabase's raw auth errors; they
   distinguish "no such user" from "wrong password" and enable enumeration.
10. **One prompt, one commit.** Never bundle unrelated fixes.

## 8. Manual steps — no prompt can do these

These need credentials or a browser that the agent does not have. Do them yourself.

| # | Step | Why an agent cannot |
|---|---|---|
| M1 | Paste `0007_realtime_orders.sql` into the Supabase SQL Editor | No `SUPABASE_DB_PASSWORD` available |
| M2 | Add `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ORDER_EMAIL_FROM` to GitHub secrets | Secrets are write-only; never paste them into a chat session |
| M3 | Verify the Resend sending domain | Requires dashboard access |
| M4 | Confirm your admin account is the one bootstrapped by `0003_bootstrap_admin.sql` | The DB password is not yours to share |
| M5 | Delete the test merchant (`kfdtest.merchant@kfd.ph`) and remove `0006_dev_merchant_login.sql` before real data | Destructive auth operation |
| M6 | Manually test realtime tenant isolation (insert for a different `restaurant_id`, confirm nothing arrives) | Requires two authenticated sessions |
| M7 | Grant Release Please workflow permissions | Repository admin setting |
| M8 | Physical-device Expo push test | Emulators do not receive pushes reliably |

## 9. Master verification checklist

Run before considering any phase complete.

```bash
cd admin
npm run typecheck     # must be clean
npm run lint          # must be clean
npm run build         # must succeed, all routes present
```

Manual, in a browser:

- [ ] Every page has distinct loading, error, and empty states
- [ ] No raw JSON, stack trace, or provider name is visible anywhere
- [ ] No page displays a metric whose value and trend describe different periods
- [ ] The displayed role always matches `app_users.role`
- [ ] Every destructive action is confirmed and reversible-or-explained
- [ ] Full keyboard traversal works on `/`, `/orders`, `/merchant`, `/merchant/orders`
- [ ] Skip link is the first Tab stop and moves focus into `<main>`
- [ ] No hydration warnings in the console
- [ ] Nothing overflows at 320 / 375 / 768px
- [ ] A merchant cannot see another restaurant's orders, data, or notifications
- [ ] No secret is present in any client bundle
- [ ] The app is usable with JavaScript enabled but a slow network (no infinite spinners)

## 10. Suggested execution order

1. **Phase 0** — land the in-flight realtime work (M1, M6)
2. **Phase 1, all six** — pure defect fixes, no decisions, immediate value
3. **Phase 2.1–2.3** — mechanical dashboard corrections
4. **Phase 2.4 decision** — the most consequential choice in this document
5. **Phase 5** — accessibility, cheap, and often legally required
6. **Phase 3.1, 3.2** — search honesty and safe destructive actions
7. **Phase 3.3** — merchant provisioning (replaces SQL-by-hand; retire `0006`)
8. **Phase 2.5** — persist rejection reasons
9. **Phase 4** — notification consolidation
10. **Phase 3.4** — customer tracking (largest; needs a decision first)
11. **Phase 6** — mobile app, then push
12. **M2–M5, M7, M8** — the manual items, whenever you have the access
