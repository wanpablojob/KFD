-- --------------------------------------------------------------------------
-- Shop photos
--
-- Restaurants had no picture, so every card in the customer app was a first
-- letter on a tinted square. This adds restaurants.image_url, set by the
-- restaurant's merchant from the app, and returns it everywhere a customer
-- sees a restaurant.
--
-- The photo itself goes into the public menu-images bucket (0086) under the
-- restaurant's own folder, which that bucket's policies already restrict to
-- the restaurant's merchant. merchant_set_shop_image only accepts a URL inside
-- that folder, so a merchant cannot point their shop at an arbitrary site.
-- --------------------------------------------------------------------------

alter table public.restaurants
  add column if not exists image_url text;

comment on column public.restaurants.image_url is
  'Public URL of the shop photo in the menu-images bucket, under the restaurant''s folder (0090). Null shows the initial.';

create or replace function public.merchant_set_shop_image(p_url text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant text := public.current_merchant_restaurant();
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if v_restaurant is null then
    raise exception 'Your account is not attached to a restaurant.' using errcode = '42501';
  end if;

  if v_url is not null
     and v_url not like '%/storage/v1/object/public/menu-images/' || v_restaurant || '/%' then
    raise exception 'Upload the photo from the app first.' using errcode = '22023';
  end if;

  update restaurants set image_url = v_url where id = v_restaurant;
  return v_url;
end;
$$;

comment on function public.merchant_set_shop_image(text)
  is 'The calling merchant sets or clears their shop photo; the URL must be in their own menu-images folder (0090).';

revoke all on function public.merchant_set_shop_image(text) from public, anon;
grant execute on function public.merchant_set_shop_image(text) to authenticated;

-- search_restaurants: 0077's body, plus image_url. The return type changes, so
-- this is a drop and create rather than a replace.
drop function if exists public.search_restaurants(text, text);

create function public.search_restaurants(
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
  archived_at timestamptz,
  is_open boolean,
  prep_minutes int,
  image_url text
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
      r.archived_at,
      r.is_open,
      r.prep_minutes,
      r.image_url
    from restaurants r
    where r.status = 'active'
      and r.archived_at is null
      and (p_cuisine is null or p_cuisine = '' or r.cuisine = p_cuisine)
      and (
        v_q is null
        or lower(r.name) like '%' || v_q || '%'
        or lower(r.cuisine) like '%' || v_q || '%'
      )
    -- Open kitchens first, so a closed one never sits above one you can order from.
    order by r.is_open desc, r.name;
end;
$$;

comment on function public.search_restaurants(text, text)
  is 'Active, non-archived restaurants matching a name/cuisine substring and optional cuisine, open ones first, with open status, prep time and shop photo (0090). Customers only.';
revoke all on function public.search_restaurants(text, text) from public;
revoke all on function public.search_restaurants(text, text) from anon;
grant execute on function public.search_restaurants(text, text) to authenticated;
