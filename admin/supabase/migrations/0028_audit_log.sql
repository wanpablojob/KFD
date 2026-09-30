-- --------------------------------------------------------------------------
-- Audit log for app_users (provisioning changes)
--
-- Provisioning is the highest-stakes write in the system: it is how an auth
-- account becomes an admin, merchant, rider or customer, and a mistake here is
-- a lockout or a privilege escalation. Until now those writes left no trace --
-- set_merchant_access, set_rider_access, revoke_*, and register_customer all
-- mutate app_users silently, and the only "record" is the final row state.
--
-- This adds an append-only log and a trigger so every INSERT/UPDATE/DELETE on
-- app_users is captured: who did it (auth.uid()), what action, and the
-- before/after role and restaurant. It is deliberately INSERT-only over
-- PostgREST (no RLS on SELECT for the anon/authenticated roles; only admins
-- read it through the same is_platform_admin gate as everything else) and
-- nobody can UPDATE/DELETE audit rows -- an audit log that can be rewritten is
-- not an audit log.
--
-- Why a trigger, not edits to each SECURITY DEFINER function:
--   * the functions are five moving targets; a trigger catches every path,
--     present and future, including direct SQL and future RPCs, in one place.
--   * auth.uid() is still the caller's JWT inside the trigger, even though the
--     mutating statement ran as the function owner (SECURITY DEFINER keeps the
--     session's JWT context). So the actor column is honest.
-- --------------------------------------------------------------------------

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  table_name text not null default 'app_users',
  record_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_user_id uuid,
  old_role app_role,
  new_role app_role,
  old_restaurant_id text,
  new_restaurant_id text,
  changed_at timestamptz not null default now()
);

comment on table audit_log is
  'Append-only audit trail. Currently records app_users provisioning changes; the shape is generic so other tables can be added later.';

comment on column audit_log.actor_user_id is
  'auth.uid() of the session that made the change. NULL when the change came from system SQL (migrations, no JWT).';

-- Append-only: no UPDATE, no DELETE, ever. Granting SELECT only to admins via
-- RLS below; anon/authenticated get nothing.
alter table audit_log enable row level security;

drop policy if exists "admins read audit log" on audit_log;
create policy "admins read audit log"
  on audit_log for select
  to authenticated
  using (public.is_platform_admin());

-- No INSERT policy: writes happen only through the trigger (SECURITY DEFINER),
-- never from a client statement.

create or replace function public.audit_app_users_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (
    record_id,
    action,
    actor_user_id,
    old_role,
    new_role,
    old_restaurant_id,
    new_restaurant_id
  ) values (
    case
      when tg_op = 'DELETE' then old.user_id
      else new.user_id
    end,
    lower(tg_op),
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then old.role else null end,
    case when tg_op in ('INSERT', 'UPDATE') then new.role else null end,
    case when tg_op in ('UPDATE', 'DELETE') then old.restaurant_id else null end,
    case when tg_op in ('INSERT', 'UPDATE') then new.restaurant_id else null end
  );
  return coalesce(new, old);
end;
$$;

comment on function public.audit_app_users_changes()
  is 'Writes an audit_log row on every app_users INSERT/UPDATE/DELETE, capturing the actor and the before/after role and restaurant.';

drop trigger if exists app_users_audit on app_users;
create trigger app_users_audit
  after insert or update or delete on app_users
  for each row
  execute function public.audit_app_users_changes();

comment on trigger app_users_audit on app_users is
  'Append-only audit of provisioning changes. No role can UPDATE or DELETE audit_log rows.';
