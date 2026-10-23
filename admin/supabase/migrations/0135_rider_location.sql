-- --------------------------------------------------------------------------
-- 0135: where the rider is, for the customer waiting on them
--
-- The tracker said "on the way" and nothing more. The rider app now reports
-- its position while the rider has a job (only while the app is open: no
-- background tracking), and the customer whose order it is can see where the
-- rider is, as a pin in their own maps app. No maps API key is needed.
--
-- Only the latest position is kept, one row per rider: there is no movement
-- history to leak or to keep. It is readable only through the customer's own
-- order while it is on its way, and a position older than 15 minutes is not
-- shown -- a stale pin is worse than none.
-- --------------------------------------------------------------------------

create table if not exists public.rider_locations (
  rider_id text primary key references public.riders (id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision,
  updated_at timestamptz not null default now()
);

comment on table public.rider_locations is
  'Each rider''s latest position while they have a job (0135). One row per rider, no history. Written and read only through RPCs.';

alter table public.rider_locations enable row level security;
revoke all on table public.rider_locations from anon, authenticated;


create or replace function public.rider_report_location(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider text := public.current_rider_id();
begin
  if v_rider is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;

  -- Only while carrying something: off the job, a rider's whereabouts are
  -- nobody's business. False tells the app it can stop sending.
  if not exists (
       select 1 from orders
        where rider_id = v_rider and status in ('confirmed', 'preparing', 'out_for_delivery'))
     and not exists (
       select 1 from deliveries
        where rider_id = v_rider and status in ('confirmed', 'preparing', 'out_for_delivery'))
     and not exists (
       select 1 from pabakal_requests
        where rider_id = v_rider and status in ('accepted', 'delivering')) then
    delete from rider_locations where rider_id = v_rider;
    return false;
  end if;

  insert into rider_locations (rider_id, latitude, longitude, accuracy_m, updated_at)
  values (v_rider, p_latitude, p_longitude, p_accuracy, now())
  on conflict (rider_id) do update
     set latitude = excluded.latitude,
         longitude = excluded.longitude,
         accuracy_m = excluded.accuracy_m,
         updated_at = now();
  return true;
end;
$$;

comment on function public.rider_report_location(double precision, double precision, double precision)
  is 'The calling rider''s latest position, kept only while they have an order, trip or pabakal in hand (0135). Returns false, and forgets the position, when they have none.';
revoke all on function public.rider_report_location(double precision, double precision, double precision) from public, anon;
grant execute on function public.rider_report_location(double precision, double precision, double precision) to authenticated;


create or replace function public.customer_rider_location(p_reference text)
returns table (latitude double precision, longitude double precision, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rider text;
begin
  if auth.uid() is null then
    return;
  end if;

  -- The caller's own order, trip or pabakal, while it is on its way.
  select rider_id into v_rider from (
    select o.rider_id from orders o
     where o.reference = p_reference and o.customer_user_id = auth.uid()
       and o.status = 'out_for_delivery'
    union all
    select d.rider_id from deliveries d
     where d.reference = p_reference and d.customer_user_id = auth.uid()
       and d.status = 'out_for_delivery'
    union all
    select p.rider_id from pabakal_requests p
     where p.reference = p_reference and p.customer_user_id = auth.uid()
       and p.status = 'delivering'
  ) mine
  where rider_id is not null
  limit 1;

  if v_rider is null then
    return;
  end if;

  return query
    select l.latitude, l.longitude, l.updated_at
      from rider_locations l
     where l.rider_id = v_rider
       and l.updated_at > now() - interval '15 minutes';
end;
$$;

comment on function public.customer_rider_location(text)
  is 'Where the rider is, for the signed-in customer whose order, trip or pabakal it is, while it is on its way; nothing older than 15 minutes (0135).';
revoke all on function public.customer_rider_location(text) from public, anon;
grant execute on function public.customer_rider_location(text) to authenticated;
