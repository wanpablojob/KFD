-- --------------------------------------------------------------------------
-- Server-side restaurant search (storefront)
--
-- The customer home currently fetches every active restaurant and filters
-- name/cuisine in memory (fetchActiveRestaurants + a useMemo in the screen).
-- That is fine at a handful of rows, but it scales poorly and forces the client
-- to carry the whole catalogue. This RPC moves the search server-side so the
-- query (name or cuisine substring) and the optional cuisine filter are applied
-- in SQL, and the client only receives matches.
--
-- Security model mirrors the 0021 browse policy exactly: a customer -- and only
-- a customer -- reads active, non-archived restaurants. SECURITY DEFINER with
-- the is_customer() re-check, like customer_place_order re-checks its caller,
-- so the function cannot be widened into a backdoor for another role. A null or
-- empty query returns the full active catalogue, so the same call serves both
-- the initial load and a typed search.
-- --------------------------------------------------------------------------

create or replace function public.search_restaurants(
  p_query text default null,
  p_cuisine text default null
)
returns table (
  id text,
  name text,
  cuisine text,
  city text,
  rating numeric,
  status restaurant_status,
  archived_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text;
begin
  if not public.is_customer() then
    raise exception 'This action is for customers only.'
      using errcode = '42501';
  end if;

  v_q := nullif(btrim(coalesce(p_query, '')), '');
  v_q := lower(v_q);

  return query
    select
      r.id,
      r.name,
      r.cuisine,
      r.city,
      r.rating,
      r.status,
      r.archived_at
    from restaurants r
    where r.status = 'active'
      and r.archived_at is null
      and (p_cuisine is null or p_cuisine = '' or r.cuisine = p_cuisine)
      and (
        v_q is null
        or lower(r.name) like '%' || v_q || '%'
        or lower(r.cuisine) like '%' || v_q || '%'
      )
    order by r.name;
end;
$$;

comment on function public.search_restaurants(text, text)
  is 'Active, non-archived restaurants matching a name/cuisine substring and optional cuisine, ordered by name. Customers only.';

revoke all on function public.search_restaurants(text, text) from public;
revoke all on function public.search_restaurants(text, text) from anon;
grant execute on function public.search_restaurants(text, text) to authenticated;
