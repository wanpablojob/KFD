-- 0050's suspension guard blocks the function it exists to protect.
--
-- riders_block_direct_suspension_write() raises on any change to
-- suspended_at / suspended_reason, with no exception for
-- admin_set_rider_suspended() -- which is the only thing allowed to make that
-- change. So suspending a rider fails with its own error message:
--
--     Use admin_set_rider_suspended to change suspension.
--
-- Reinstate appears to work only because it sets the columns to the values they
-- already have, so the trigger's `is distinct from` never fires. It is a no-op
-- that reports success, which is worse than a visible failure.
--
-- The guard is not removed. Its job is real -- a client that could write
-- suspended_at directly would skip both the required reason and the audit row --
-- and it just cannot tell the legitimate caller from an illegitimate one.
--
-- ---------------------------------------------------------------------------
-- Why the obvious fixes do not work here
-- ---------------------------------------------------------------------------
-- current_user: the trigger function is SECURITY DEFINER, so current_user inside
-- it is the owner, for every caller. It cannot distinguish them. (This is the
-- same trap 0072's audit_log fix walked past.)
--
-- A bare set_config flag: any authenticated user can set a custom GUC on their
-- own session. `set myapp.allow_suspension = 'on'` would defeat the guard, so
-- that is not a guard.
--
-- ---------------------------------------------------------------------------
-- What does work: the flag can only be set by a function the client cannot call.
-- ---------------------------------------------------------------------------
-- begin_rider_suspension_write() is SECURITY DEFINER with execute revoked from
-- anon and authenticated, so the only caller that can flip the flag is
-- admin_set_rider_suspended() itself. A client writing suspended_at directly
-- cannot reach it, so the flag stays unset and the trigger raises.

create or replace function public.begin_rider_suspension_write()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Transaction-local (the true), so it cannot leak to the next statement or
  -- the next request on a pooled connection.
  perform set_config('kfd.rider_suspension_write', 'on', true);
end;
$$;

comment on function public.begin_rider_suspension_write() is
  'Flips the transaction-local flag riders_block_direct_suspension_write() checks. Execute is revoked from anon and authenticated, so only admin_set_rider_suspended can set it.';

revoke all on function public.begin_rider_suspension_write() from public;
revoke all on function public.begin_rider_suspension_write() from anon;
revoke all on function public.begin_rider_suspension_write() from authenticated;

-- The guard, unchanged except for the exemption.
create or replace function public.riders_block_direct_suspension_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text := current_setting('kfd.rider_suspension_write', true);
begin
  if v_allowed is distinct from 'on' then
    if new.suspended_at is distinct from old.suspended_at
       or new.suspended_reason is distinct from old.suspended_reason then
      raise exception 'Use admin_set_rider_suspended to change suspension.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.riders_block_direct_suspension_write() is
  'Trigger guard: riders.suspended_at and suspended_reason may only be changed through admin_set_rider_suspended, so the reason requirement and the audit row cannot be bypassed by a direct UPDATE. Exempts the RPC via a transaction-local flag only that RPC can set.';

-- ---------------------------------------------------------------------------
-- admin_set_rider_suspended, with the flag set immediately before its UPDATE.
-- ---------------------------------------------------------------------------
-- The guard guard needs to open the gate; the reason is still required and the
-- audit row is still written, so nothing about the rule itself is relaxed.
create or replace function public.admin_set_rider_suspended(
  p_rider_id text,
  p_suspended boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_reason text;
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  select r.name into v_name from public.riders r where r.id = p_rider_id;
  if v_name is null then
    raise exception 'No rider with that id.' using errcode = 'P0001';
  end if;

  if p_suspended and btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required to suspend a rider.' using errcode = 'P0001';
  end if;

  v_reason := case when p_suspended then btrim(p_reason) else null end;

  perform public.begin_rider_suspension_write();

  update public.riders
     set suspended_at = case when p_suspended then now() else null end,
         suspended_reason = v_reason
   where id = p_rider_id;

  perform public.audit_rider_event(
    p_rider_id,
    case when p_suspended then 'rider.suspended' else 'rider.unsuspended' end,
    jsonb_build_object('reason', v_reason)
  );
end;
$$;

comment on function public.admin_set_rider_suspended(text, boolean, text) is
  'The only writer of riders.suspended_at and suspended_reason. Requires admin, requires a reason to suspend, and writes an audit row.';

revoke all on function public.admin_set_rider_suspended(text, boolean, text) from public;
revoke all on function public.admin_set_rider_suspended(text, boolean, text) from anon;
grant execute on function public.admin_set_rider_suspended(text, boolean, text) to authenticated;