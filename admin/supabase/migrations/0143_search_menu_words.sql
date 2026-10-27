-- --------------------------------------------------------------------------
-- 0143: dish search matches every word, in any order
--
-- 0142 matched the whole query as one piece of text, so word order mattered:
-- "inasal manok" missed "Manok Inasal Paa", "chicken inasal" missed "Inasal
-- (Chicken)", and "inasal habhab" (a dish and the shop) found nothing because
-- the shop name was not searched. Now every word typed has to appear in the
-- dish name, its category or the shop name, in any order. Plain text matching
-- (strpos), so a % or _ in the query is a character, not a wildcard.
-- Everything else stands: available dishes, active shops, customers only,
-- open kitchens first.
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
  v_words text[];
  v_limit int;
begin
  if not public.is_customer() then
    raise exception 'This action is for customers only.'
      using errcode = '42501';
  end if;
  v_words := array_remove(
    regexp_split_to_array(lower(btrim(coalesce(p_query, ''))), '\s+'), '');
  if coalesce(array_length(v_words, 1), 0) = 0 then
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
      and not exists (
        select 1 from unnest(v_words) w
         where strpos(lower(m.name || ' ' || coalesce(m.category, '') || ' ' || r.name), w) = 0
      )
    -- Same reason as the shop list: never rank a closed kitchen above one that
    -- can take the order right now.
    order by r.is_open desc, r.name, m.category, m.name
    limit v_limit;
end;
$$;

comment on function public.search_menu_items(text, text, int)
  is 'Available dishes on active restaurants where every query word appears in the dish name, category or shop name (any order), optional cuisine, open kitchens first. Customers only; empty query returns nothing (0143).';
revoke all on function public.search_menu_items(text, text, int) from public;
revoke all on function public.search_menu_items(text, text, int) from anon;
grant execute on function public.search_menu_items(text, text, int) to authenticated;
