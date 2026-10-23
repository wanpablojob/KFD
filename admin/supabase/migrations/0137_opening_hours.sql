-- --------------------------------------------------------------------------
-- 0137: a shop can set its opening hours
--
-- Open and closed was a switch the merchant had to flip by hand, twice a day.
-- A shop that forgot to close kept taking orders at night. Now a shop can set
-- one opening and one closing time (the same every day; overnight hours such
-- as 18:00-02:00 work), in Philippine time.
--
-- The schedule acts only at those two moments: at opening time the shop opens,
-- at closing time it closes. In between the merchant's own switch still wins,
-- so closing early, or opening late, holds until the next opening or closing.
-- A shop with no hours set works exactly as before.
-- --------------------------------------------------------------------------

alter table public.restaurants
  add column if not exists opens_at time,
  add column if not exists closes_at time,
  -- What the schedule last applied, so it acts on a change of state and never
  -- fights the merchant's switch in between.
  add column if not exists schedule_open boolean,
  add constraint restaurants_hours_together
    check ((opens_at is null) = (closes_at is null) and (opens_at is null or opens_at <> closes_at));

comment on column public.restaurants.opens_at is
  'Daily opening time, Philippine time (0137). Null with closes_at: no schedule, the switch only.';


-- Whether a schedule says "open" at a given local time; overnight hours wrap.
create or replace function public.hours_say_open(p_opens time, p_closes time, p_at time)
returns boolean
language sql
immutable
as $$
  select case
    when p_opens is null or p_closes is null then null
    when p_opens < p_closes then p_at >= p_opens and p_at < p_closes
    else p_at >= p_opens or p_at < p_closes
  end;
$$;


create or replace function public.apply_opening_hours(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local time := (p_now at time zone 'Asia/Manila')::time;
  v_count integer;
begin
  with changed as (
    update restaurants r
       set is_open = s.should,
           schedule_open = s.should,
           updated_at = now()
      from (
        select id, hours_say_open(opens_at, closes_at, v_local) as should
          from restaurants
         where opens_at is not null and archived_at is null
      ) s
     where r.id = s.id
       and r.schedule_open is distinct from s.should
    returning 1
  )
  select count(*)::int into v_count from changed;
  return v_count;
end;
$$;

comment on function public.apply_opening_hours(timestamptz)
  is 'Opens or closes shops at their opening and closing times, Philippine time; leaves the merchant''s switch alone in between (0137). Run every minute by pg_cron.';
revoke all on function public.apply_opening_hours(timestamptz) from public, anon, authenticated;


create or replace function public.merchant_set_hours(p_opens time default null, p_closes time default null)
returns table (opens_at time, closes_at time)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant text := public.current_merchant_restaurant();
begin
  if auth.uid() is null or v_restaurant is null then
    raise exception 'Only a restaurant''s merchant can set its hours.' using errcode = '42501';
  end if;
  if (p_opens is null) <> (p_closes is null) then
    raise exception 'Set both the opening and closing time, or neither.' using errcode = '22023';
  end if;
  if p_opens is not null and p_opens = p_closes then
    raise exception 'Opening and closing time cannot be the same.' using errcode = '22023';
  end if;

  -- Applied at once: a shop setting 08:00-20:00 at noon is open now.
  return query
    update restaurants r
       set opens_at = p_opens,
           closes_at = p_closes,
           is_open = coalesce(
             hours_say_open(p_opens, p_closes, (now() at time zone 'Asia/Manila')::time),
             r.is_open),
           schedule_open = hours_say_open(p_opens, p_closes, (now() at time zone 'Asia/Manila')::time),
           updated_at = now()
     where r.id = v_restaurant
    returning r.opens_at, r.closes_at;
end;
$$;

comment on function public.merchant_set_hours(time, time)
  is 'The calling merchant sets their shop''s daily opening and closing time, or clears both (0137).';
revoke all on function public.merchant_set_hours(time, time) from public, anon;
grant execute on function public.merchant_set_hours(time, time) to authenticated;


do $$
declare
  v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname = 'apply-opening-hours' loop
    perform cron.unschedule(v_jobid);
  end loop;
end $$;

select cron.schedule(
  'apply-opening-hours',
  '* * * * *',
  $job$
    select public.apply_opening_hours();
  $job$
);
