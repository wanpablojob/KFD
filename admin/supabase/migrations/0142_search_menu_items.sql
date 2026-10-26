-- --------------------------------------------------------------------------
-- Server-side dish search (storefront)
--
-- search_restaurants (0029) compares the typed text against restaurants.name
-- and restaurants.cuisine and nothing else. So a customer who types a dish
-- name -- "baboy", for the Habhab menu item called exactly that -- is told
-- "No match for that search" while the dish sits on a menu one tap away. No
-- restaurant is named Baboy and "baboy" is not a cuisine, so the row can never
-- match. Half of what a customer searches for is a dish, not a shop.
--
-- Dishes get their own lookup instead of being folded into search_restaurants:
-- one restaurant row cannot say *which* of its dishes matched, and repeating
-- the shop once per matching dish would make the restaurant list lie about how
-- many shops exist.
--
-- Security mirrors 0029 exactly: SECURITY DEFINER with an is_customer()
-- re-check, and execute revoked from public and anon. Only dishes a customer
-- could actually order are returned -- available items on active, non-archived
-- restaurants -- so a search never surfaces something the menu screen hides.
--
-- An empty query returns no rows on purpose. The restaurant list already covers
-- the empty case, and a dish list that appears before anyone types would be a
-- second, louder catalogue nobody asked for.
-- --------------------------------------------------------------------------

create or replace function public.search_menu_items(
  p_query text default null,
  p_cuisine text default null,
  p_limit int default 30
)
returns table (
  id text,
  name text,
  category text,
  price numeric,
  image_url text,
  restaurant_id text,
  restaurant text,
  is_open boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text;
  v_limit int;
begin
  if not public.is_customer() then
    raise exception 'This action is for customers only.'
      using errcode = '42501';
  end if;

  v_q := lower(nullif(btrim(coalesce(p_query, '')), ''));
  if v_q is null then
    return;
  end if;

  -- Free-form argument into a LIMIT; clamp rather than trust it.
  v_limit := least(greatest(coalesce(p_limit, 30), 1), 50);

  return query
    select
      m.id,
      m.name,
      m.category,
      m.price,
      coalesce(m.image_url, ''),
      r.id,
      r.name,
      r.is_open
    from menu_items m
    join restaurants r on r.id = m.restaurant_id
    where m.available
      and r.status = 'active'
      and r.archived_at is null
      and (p_cuisine is null or p_cuisine = '' or r.cuisine = p_cuisine)
      and (
        lower(m.name) like '%' || v_q || '%'
        or lower(m.category) like '%' || v_q || '%'
      )
    -- Same reason as the shop list: never rank a closed kitchen above one that
    -- can take the order right now.
    order by r.is_open desc, r.name, m.category, m.name
    limit v_limit;
end;
$$;

comment on function public.search_menu_items(text, text, int)
  is 'Available dishes on active restaurants matching a name/category substring and optional cuisine, open kitchens first. Customers only; empty query returns nothing.';

revoke all on function public.search_menu_items(text, text, int) from public;
revoke all on function public.search_menu_items(text, text, int) from anon;
grant execute on function public.search_menu_items(text, text, int) to authenticated;
