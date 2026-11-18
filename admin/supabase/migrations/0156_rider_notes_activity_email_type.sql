-- --------------------------------------------------------------------------
-- 0156: the rider page's notes and activity load again
--
-- Both functions return the author's email from auth.users, whose email column
-- is varchar(255), as `text`. PL/pgSQL's RETURN QUERY requires the exact type,
-- so both failed with "structure of query does not match function result
-- type" and the rider page showed "Could not load notes / activity". Rebuilt
-- from 0051 with only the email cast to text.
-- --------------------------------------------------------------------------

create or replace function public.admin_rider_activity(p_rider_id text)
returns table (
  id bigint,
  event text,
  detail jsonb,
  actor_email text,
  changed_at timestamptz
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
  select
    a.id,
    coalesce(a.event, 'rider.' || a.action),
    a.detail,
    coalesce(u.email::text, a.actor_user_id::text, 'system'),
    a.changed_at
  from audit_log a
  left join auth.users u on u.id = a.actor_user_id
  where a.rider_id = p_rider_id
  order by a.changed_at desc, a.id desc
  limit 200;
end;
$$;

create or replace function public.admin_rider_notes(p_rider_id text)
returns table (
  id bigint,
  body text,
  author_email text,
  created_at timestamptz
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
  select
    n.id,
    n.body,
    coalesce(u.email::text, '(account removed)'),
    n.created_at
  from rider_notes n
  left join auth.users u on u.id = n.author_user_id
  where n.rider_id = p_rider_id
  order by n.created_at desc, n.id desc;
end;
$$;
