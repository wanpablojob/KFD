-- --------------------------------------------------------------------------
-- Publish order changes to Supabase Realtime.
--
-- A table must be a member of the supabase_realtime publication before
-- postgres_changes emits anything for it, and omitting it fails silently:
-- the subscription connects, reports SUBSCRIBED, and never delivers an
-- event. This migration is the only thing standing between the merchant
-- portal and a live feed that appears to work but does not.
--
-- Tenant isolation is handled by the 'scoped access: orders' policy from
-- 0002, not here. RLS is applied per subscriber, so each merchant only
-- receives rows matching their restaurant_id. The browser subscribes with
-- the authenticated client, never the service role.
--
-- REPLICA IDENTITY FULL is deliberately not set. Consumers treat every
-- event as a signal to refetch the full list rather than merging payloads,
-- so the previous row version is never needed, and FULL would add WAL
-- overhead for nothing.
-- --------------------------------------------------------------------------

do $$
begin
  -- alter publication ... add table is not idempotent and errors on re-run,
  -- which would break the "apply migrations more than once" workflow the
  -- earlier migrations all tolerate.
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end
$$;
