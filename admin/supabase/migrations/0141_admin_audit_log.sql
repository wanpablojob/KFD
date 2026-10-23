-- --------------------------------------------------------------------------
-- 0141: admins can read the audit log
--
-- Admin actions have been recorded since 0028 (account roles) and 0050 (rider
-- events: suspensions, payouts paid, accounts closed), but nothing showed
-- them, and the actor was only a user id. This returns the log newest first,
-- with the actor's and the changed account's email, for the admin Activity
-- page. Admins only; the table itself stays unreadable to everyone else.
-- --------------------------------------------------------------------------

create or replace function public.admin_audit_log(p_limit integer default 100, p_before bigint default null)
returns table (
  id bigint,
  changed_at timestamptz,
  actor_email text,
  table_name text,
  action text,
  event text,
  rider_id text,
  account_email text,
  old_role text,
  new_role text,
  old_restaurant_id text,
  new_restaurant_id text,
  detail jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
    select a.id, a.changed_at, actor.email::text, a.table_name, a.action, a.event, a.rider_id,
           account.email::text, a.old_role::text, a.new_role::text,
           a.old_restaurant_id, a.new_restaurant_id, a.detail
      from audit_log a
      left join auth.users actor on actor.id = a.actor_user_id
      left join auth.users account on account.id = a.record_id
     where p_before is null or a.id < p_before
     order by a.id desc
     limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

comment on function public.admin_audit_log(integer, bigint)
  is 'The audit log newest first, with actor and account emails, for the admin Activity page (0141). Admins only.';
revoke all on function public.admin_audit_log(integer, bigint) from public, anon;
grant execute on function public.admin_audit_log(integer, bigint) to authenticated;
