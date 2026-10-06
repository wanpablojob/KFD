-- audit_log.action is NOT NULL, and audit_rider_event() never set it.
--
-- Migration 0028 created audit_log with
--     action text not null check (action in ('insert','update','delete'))
-- to describe CRUD changes to app_users. Migration 0050 added rider_id, event
-- and detail, and added audit_rider_event() to write the rider equivalents --
-- but its insert lists only (rider_id, event, detail, actor_user_id):
--
--     insert into audit_log (rider_id, event, detail, actor_user_id)
--     values (p_rider_id, p_event, p_detail, auth.uid());
--
-- So every call raises:
--     null value in column "action" of relation "audit_log" violates not-null
--     constraint
--
-- That is not one broken feature. audit_rider_event is called from five places,
-- and each one raises inside the caller's transaction, so the write rolls back
-- with it:
--
--   * admin_set_rider_suspended      suspend / reinstate a rider   -> fails
--   * admin_add_rider_note           add an internal note        -> fails
--   * the 0051 riders_audit_changes  status change, account attach/revoke -> fails
--   * review_rider_application       approving an application    -> fails
--
-- Account attach was the one I hit: set_rider_access('rider@kfd.com', ...)
-- found the auth account and then died writing its own audit row.
--
-- ---------------------------------------------------------------------------
-- The fix
-- ---------------------------------------------------------------------------
-- `event` carries the precise, dotted name and already exists for exactly this.
-- `action` stays the coarse CRUD verb, so the CHECK constraint from 0028 is left
-- exactly as it was rather than widened to accommodate a second vocabulary.
--
--   update  the rider row changed (status, suspension, account link)
--   insert  a new record about the rider (a note, an approval)
--
-- Derived from the event name so the mapping cannot drift as events are added:
-- anything that mutates the rider is an update, anything that records a new fact
-- is an insert.
--
-- Why the column was NOT made nullable instead: `action` is the whole story for
-- the app_users rows that predate `event` (0028's own comment says so), and
-- making it nullable would mean every existing reader of action has to handle
-- null. Deriving a verb from the event keeps both columns meaningful.

create or replace function public.audit_rider_event(
  p_rider_id text,
  p_event text,
  p_detail jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (rider_id, event, action, detail, actor_user_id)
  values (
    p_rider_id,
    p_event,
    -- Mutations of the rider row versus new records about it. The mapping is
    -- here rather than at each call site so a new event cannot forget it, which
    -- is exactly how this bug happened.
    case
      when p_event in ('rider.note_added', 'rider.application_approved')
        then 'insert'
      else 'update'
    end,
    p_detail,
    auth.uid()
  );
end;
$$;

comment on function public.audit_rider_event(text, text, jsonb) is
  'Appends a rider event to audit_log with the calling user as the actor. Sets action as well as event: the column is NOT NULL from 0028, and omitting it raised on every call. Internal: not granted to anon or authenticated.';

revoke all on function public.audit_rider_event(text, text, jsonb) from public;
revoke all on function public.audit_rider_event(text, text, jsonb) from anon;
revoke all on function public.audit_rider_event(text, text, jsonb) from authenticated;