-- --------------------------------------------------------------------------
-- Persisted notification read state (Prompt 4.2)
--
-- The bell tracked unreadness in a component-local useState, so it reset on
-- every reload and the indicator was meaningless across sessions: an operator
-- who had already triaged the morning's orders was nagged again on every
-- refresh.
--
-- --------------------------------------------------------------------------
-- Why a column, and not localStorage
--
-- The brief allows three strategies. localStorage is the cheapest, and it was
-- rejected on a specific ground rather than a general one: this is a back-office
-- console, so a device is routinely shared. A marker that lives in the browser
-- would either nag the next operator who signs in on that machine, or -- if
-- keyed by user id to avoid that -- still not agree across the two devices one
-- operator might use, which is the original complaint.
--
-- A notifications table is the other option and is not needed: there is nothing
-- to record. Unreadness is derivable from orders.placed_at against a single
-- high-water mark, so a table would be a second source of truth for a fact that
-- is already derivable, plus a write per read.
--
-- So: one timestamp on the account. It is account-scoped, so it is correct on a
-- shared device, and it agrees across devices, which is the actual defect.
--
-- --------------------------------------------------------------------------
-- Why a function rather than a policy
--
-- 0011 closed every write path to app_users on purpose, because the provisioning
-- functions are SECURITY DEFINER and a direct PostgREST write would bypass every
-- rule they enforce. Reopening an UPDATE policy to save a timestamp would undo
-- that for the sake of a cosmetic feature.
--
-- This function writes exactly one row: the caller's own, selected by
-- auth.uid(). There is no caller-supplied user id, so there is nothing to
-- escalate -- it cannot mark another account as read even if a caller asks it
-- to. The GRANT to authenticated is the only permission that matters, and the
-- read side already works through the existing own-row SELECT policy.
-- --------------------------------------------------------------------------

alter table app_users add column if not exists last_notification_seen_at timestamptz;

comment on column app_users.last_notification_seen_at is
  'Highest orders.placed_at this operator has acknowledged. Unread is derived from it rather than stored per notification, so there is no notifications table to keep in sync.';

create or replace function public.mark_notifications_seen()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  update app_users
     set last_notification_seen_at = v_now
   where user_id = auth.uid();

  -- No app_users row means no role, so there is no console to have unread
  -- notifications in. Returning null rather than inserting a row keeps this
  -- function from provisioning accounts as a side effect of opening a bell.
  if not found then
    return null;
  end if;

  return v_now;
end;
$$;

revoke all on function public.mark_notifications_seen() from public;
grant execute on function public.mark_notifications_seen() to authenticated;
