-- Restrict what a client session may write on riders.
--
-- NOT APPLIED. See the summary for who loses access and why this needs a
-- decision before it runs.
--
-- ---------------------------------------------------------------------------
-- What 0001 granted, and what 0002 already did
-- ---------------------------------------------------------------------------
-- 0001 created "authenticated full access: riders": for all, to authenticated,
-- using (true) with check (true). Every signed-in user -- every rider, every
-- customer, every merchant -- could read and write every rider row.
--
-- 0002 already narrowed it. It dropped that policy and recreated it with
-- using (public.is_platform_admin()) with check (public.is_platform_admin()),
-- and added is_platform_admin() itself. 0018 then added a second, additive
-- policy letting a rider read their own row (using (user_id = auth.uid())).
--
-- Postgres ORs permissive policies, so the effective rules today are:
--
--   SELECT   admin sees all; a rider sees their own row.
--   INSERT   admin only.
--   UPDATE   admin only.
--   DELETE   admin only.
--
-- So the write surface is already admin-gated at the policy level, and this
-- migration is not closing a wide-open hole. Two things remain:
--
--   1. The policy is still NAMED "authenticated full access: riders", which is
--      now a lie and will mislead the next person to read it. Renamed below.
--
--   2. RLS says WHO may write; it does not say WHICH COLUMNS. An admin client's
--      UPDATE can still set deliveries, earnings and rating directly, bypassing
--      the payout ledger entirely. That is not hypothetical: the rider edit form
--      did exactly this until it was split into createRider / updateRiderProfile.
--      The application no longer does it, but the database still permits it, and
--      the next console edit or new code path could.
--
-- ---------------------------------------------------------------------------
-- Why column privileges rather than a trigger
-- ---------------------------------------------------------------------------
-- 0050 guards suspended_at with a BEFORE UPDATE trigger. That works for a
-- column pair, but a trigger has to decide "is this caller allowed", and the
-- usual answers are either a role check (current_user <> 'postgres', which
-- breaks if Supabase changes the owner) or a session flag (set_config, which any
-- authenticated user can also call, so it is not a guard at all).
--
-- A column privilege is checked by Postgres before any trigger runs, is not
-- guessable, and cannot be talked around by a client. Dropping the blanket
-- UPDATE grant and granting it back per column says exactly which five fields a
-- client may touch.
--
-- The security-definer functions are unaffected: rider_mark_delivered and
-- friends execute as the table owner and do not go through the authenticated
-- role's privileges.
--
-- ---------------------------------------------------------------------------
-- Role impact
-- ---------------------------------------------------------------------------
-- authenticated, and only for riders:
--
--   loses UPDATE on deliveries, earnings, rating,
--                    suspended_at, suspended_reason
--   keeps   UPDATE on name, email, phone, city, vehicle, status, archived_at
--   keeps   INSERT, and keeps full SELECT (0018's own-row policy)
--
-- That covers every write the admin app makes today: setRiderStatus updates
-- status, setRiderArchived updates archived_at, updateRiderProfile updates the
-- five profile columns.
--
-- service_role and the table owner are unaffected -- PostgREST and every
-- security-definer function bypass authenticated's privileges.
--
-- anon is unaffected: it has no policy on riders at all.
--
-- The one capability that goes away: an admin can no longer correct a counter by
-- hand from the Supabase dashboard. That is deliberate -- the ledger is the
-- source and a hand-edited counter silently disagrees with it -- but it does
-- mean a bad number now needs a repair RPC rather than a table edit.

-- Rename the policy so its name stops asserting access it does not grant.
drop policy if exists "authenticated full access: riders" on riders;

create policy "admins manage riders" on riders
  for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Column-level writes. The blanket UPDATE goes first: a table-level grant would
-- otherwise still cover every column and make the per-column grants below
-- meaningless.
revoke update on public.riders from authenticated;

grant update (name, email, phone, city, vehicle, status, archived_at, updated_at)
  on public.riders to authenticated;

comment on policy "admins manage riders" on public.riders is
  'Admin-only full access, renamed from "authenticated full access: riders" which misdescribed it since 0002. A rider reads their own row via the additive "riders read own profile" policy.';

-- Guard rail for the columns the database owns. Belt to the column privileges'
-- braces: if a later migration re-grants a blanket UPDATE, this trigger still
-- refuses the counters for a non-owner caller.
create or replace function public.riders_guard_ledger_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- current_user is 'authenticated' for a PostgREST call and the table owner
  -- for a security-definer function, which is the distinction being relied on.
  if current_user in ('authenticated', 'anon') then
    if new.deliveries is distinct from old.deliveries
       or new.earnings   is distinct from old.earnings
       or new.rating     is distinct from old.rating then
      raise exception
        'deliveries, earnings and rating are maintained by rider_mark_delivered and cannot be set directly.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.riders_guard_ledger_columns() is
  'Defence in depth behind the column privileges above: refuses direct writes to the payout-owned counters from a client session. No-op for the security-definer function that legitimately writes them.';

drop trigger if exists riders_ledger_guard on riders;
create trigger riders_ledger_guard
  before update on riders
  for each row
  execute function public.riders_guard_ledger_columns();