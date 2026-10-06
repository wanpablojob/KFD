-- The application reviewer's email on the admin queue.
--
-- rider_applications.reviewed_by is a uuid referencing auth.users, and it is set
-- on both approve and reject (0046) precisely so "who touched this" is
-- answerable. But fetch_rider_applications() does not return it, so the admin
-- queue showed a reviewed row with a note and a date and no indication of who
-- made the call -- which is the one question a reviewed row exists to answer.
--
-- Dropped and recreated because a RETURNS TABLE change cannot be made with
-- CREATE OR REPLACE: Postgres will not let a function's return type change
-- underneath it. Copied from 0051's version with one column added and a second
-- join to auth.users.
--
-- reviewer_email is coalesced to '(deleted account)' rather than null: the row
-- is still the accountability record, and a blank cell would read as "nobody
-- reviewed this" when the truth is that the reviewer's account is gone.

drop function if exists public.fetch_rider_applications(text);

create function public.fetch_rider_applications(
  p_status text default null
)
returns table (
  id uuid,
  status rider_application_status,
  full_name text,
  phone text,
  city text,
  vehicle vehicle_type,
  licence_ref text,
  orcr_ref text,
  government_id_ref text,
  decision_note text,
  created_at timestamp with time zone,
  reviewed_at timestamp with time zone,
  reviewer_email text,
  applicant_email text,
  applicant_user_id uuid,
  waiting_days integer
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    a.id, a.status, a.full_name, a.phone, a.city, a.vehicle,
    a.licence_ref, a.orcr_ref, a.government_id_ref,
    a.decision_note, a.created_at, a.reviewed_at,
    case
      when a.reviewed_by is null then null
      else coalesce(rv.email, '(deleted account)')
    end as reviewer_email,
    coalesce(u.email, '(none)') as applicant_email,
    a.user_id as applicant_user_id,
    greatest(
      0,
      floor(extract(epoch from (now() - a.created_at)) / 86400)
    )::integer as waiting_days
  from rider_applications a
  left join auth.users u on u.id = a.user_id
  left join auth.users rv on rv.id = a.reviewed_by
  where public.is_platform_admin()
    and (p_status is null or a.status::text = p_status)
  order by case when a.status = 'pending' then 0 else 1 end,
           -- Oldest pending first: an unreviewed application is the only thing
           -- in this queue that ages, and a queue sorted newest-first buries the
           -- one that has been waiting longest.
           case when a.status = 'pending' then a.created_at end asc nulls last,
           a.created_at desc;
$$;

comment on function public.fetch_rider_applications(text) is
  'Admin-only: the rider application queue with the reviewer''s email and the waiting-days count. Unapplied through 0051.';

revoke all on function public.fetch_rider_applications(text) from public;
revoke all on function public.fetch_rider_applications(text) from anon;
grant execute on function public.fetch_rider_applications(text) to authenticated;