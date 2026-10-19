-- --------------------------------------------------------------------------
-- A rider can ask, from the app, for their account to be deleted
--
-- Both app stores require that an account created in the app can be deleted
-- from the app. Customers can (delete_my_account, 0077). Riders were refused
-- there on purpose and still are: a rider account carries payouts owed and
-- cash on hand (0079), so closing it is a settlement, done by KFD staff.
--
-- What was missing is the in-app start of that process. The stores accept a
-- request flow for accounts with money attached; they do not accept "email
-- support". This records the request on the rider row, where the admin roster
-- already reads, and the admin shows it as a flag until the rider is archived.
--
-- Idempotent: asking twice keeps the first timestamp, so the queue order is
-- the order riders actually asked in.
-- --------------------------------------------------------------------------

alter table public.riders
  add column if not exists deletion_requested_at timestamptz;

comment on column public.riders.deletion_requested_at is
  'When the rider asked in the app for their account to be deleted (0082). Staff settle payouts and cash, then archive the rider and remove the login.';

create or replace function public.rider_request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in to delete your account.' using errcode = '42501';
  end if;

  -- Suspended riders may ask too: a suspension is not a reason to keep
  -- someone's data against their wishes. Archived riders are already closed.
  update riders
     set deletion_requested_at = coalesce(deletion_requested_at, now())
   where user_id = auth.uid()
     and archived_at is null
  returning deletion_requested_at into v_at;

  if v_at is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;

  return v_at;
end;
$$;

comment on function public.rider_request_account_deletion()
  is 'The calling rider asks for their account to be deleted. Records the first request time; staff close the account after settling payouts and cash (0082).';

revoke all on function public.rider_request_account_deletion() from public;
revoke all on function public.rider_request_account_deletion() from anon;
grant execute on function public.rider_request_account_deletion() to authenticated;
