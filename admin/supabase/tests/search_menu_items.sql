\set ON_ERROR_STOP 1
-- search_menu_items (0142): a dish name has to be searchable.
--
-- The bug this locks down: search_restaurants only matched restaurant name and
-- cuisine, so "baboy" -- a real menu item at Habhab -- returned nothing at all.
--
-- Assertions are made against this file's own restaurant ids, never the whole
-- result set: 0001_init.sql seeds a demo menu (including a KBL at
-- "Habhab (Kabankalan)"), and a bare name comparison would fold it in.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'dish-search-customer@example.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'dish-search-merchant@example.test');

insert into restaurants (id, name, cuisine, is_open, status, archived_at) values
  ('RS-DISH-OPEN', 'Dish Search Kitchen', 'Filipino', true, 'active', null),
  ('RS-DISH-CLOSED', 'Closed Kitchen', 'Filipino', false, 'active', null),
  ('RS-DISH-GONE', 'Archived Kitchen', 'Filipino', true, 'active', now());

insert into app_users (user_id, role, restaurant_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'customer', null),
  -- A merchant must be attached to a restaurant (app_users_merchant_needs_restaurant);
  -- any non-customer role exercises the is_customer() guard.
  ('00000000-0000-0000-0000-0000000000f2', 'merchant', 'RS-DISH-OPEN')
  on conflict (user_id) do update
    set role = excluded.role, restaurant_id = excluded.restaurant_id;

insert into menu_items (id, restaurant, restaurant_id, name, category, price, available) values
  ('MNU-DISH-BABOY', 'Dish Search Kitchen', 'RS-DISH-OPEN', 'Baboy', 'Home Cook', 100.00, true),
  ('MNU-DISH-KBL', 'Dish Search Kitchen', 'RS-DISH-OPEN', 'KBL (Kadios, Baboy, Langka)', 'Soup', 3.20, true),
  ('MNU-DISH-HIDDEN', 'Dish Search Kitchen', 'RS-DISH-OPEN', 'Baboy Sisig', 'Home Cook', 120.00, false),
  ('MNU-DISH-CLOSED', 'Closed Kitchen', 'RS-DISH-CLOSED', 'Baboy Curry', 'Home Cook', 90.00, true),
  ('MNU-DISH-GONE', 'Archived Kitchen', 'RS-DISH-GONE', 'Baboy Steak', 'Home Cook', 95.00, true),
  ('MNU-DISH-FISH', 'Dish Search Kitchen', 'RS-DISH-OPEN', 'Tinola Isda', 'Soup', 80.00, true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated","iss":"https://x.supabase.co/auth/v1"}',
  true
);

do $$
declare
  v_names text[];
  v_found boolean;
  v_restaurant text;
  v_price numeric;
  v_open_first boolean;
begin
  -- The reported case: "baboy" must find the dish called Baboy.
  select exists(
    select 1 from search_menu_items('baboy') t
    where t.name = 'Baboy' and t.restaurant_id = 'RS-DISH-OPEN'
  ) into v_found;
  if not v_found then
    raise exception 'FAIL "baboy" did not return the menu item called Baboy';
  end if;
  raise notice 'PASS a dish name is searchable';

  -- The dish has to carry the shop, the category and the price, or the result
  -- cannot be rendered or tapped through to.
  select t.restaurant, t.price into v_restaurant, v_price
    from search_menu_items('baboy') t
    where t.name = 'Baboy' and t.restaurant_id = 'RS-DISH-OPEN';
  if v_restaurant is distinct from 'Dish Search Kitchen' or v_price is distinct from 100.00 then
    raise exception 'FAIL result carried % / % (expected Dish Search Kitchen / 100.00)',
      v_restaurant, v_price;
  end if;
  raise notice 'PASS the result names the shop and its price';

  -- Case and padding must not matter: same ids either way.
  if (select array_agg(t.id order by t.id) from search_menu_items('baboy') t)
     is distinct from
     (select array_agg(t.id order by t.id) from search_menu_items('  BaBoY ') t) then
    raise exception 'FAIL case/whitespace changed the result set';
  end if;
  raise notice 'PASS search is case- and whitespace-insensitive';

  -- An unavailable item is not orderable, so it is not a search result.
  select exists(select 1 from search_menu_items('sisig') t) into v_found;
  if v_found then
    raise exception 'FAIL an unavailable dish was returned';
  end if;
  raise notice 'PASS unavailable dishes are excluded';

  -- An archived restaurant's menu is not part of the storefront.
  select exists(select 1 from search_menu_items('baboy') t where t.restaurant_id = 'RS-DISH-GONE')
    into v_found;
  if v_found then
    raise exception 'FAIL a dish on an archived restaurant was returned';
  end if;
  raise notice 'PASS archived restaurants are excluded';

  -- A closed kitchen still shows its dish, marked closed -- the shop list does
  -- the same, and hiding the dish would make a shop's menu half-searchable.
  select t.is_open into v_found
    from search_menu_items('baboy') t
    where t.restaurant_id = 'RS-DISH-CLOSED';
  if v_found is not false then
    raise exception 'FAIL a closed kitchen''s dish was missing or marked open';
  end if;
  raise notice 'PASS a closed kitchen keeps its dish, marked closed';

  -- Category is searchable too.
  select array_agg(t.name order by t.name) into v_names
    from search_menu_items('soup') t
    where t.restaurant_id = 'RS-DISH-OPEN';
  if v_names is distinct from array['KBL (Kadios, Baboy, Langka)', 'Tinola Isda']::text[] then
    raise exception 'FAIL category search returned %', v_names;
  end if;
  raise notice 'PASS category match';

  -- The cuisine chip still narrows the dish results.
  select exists(select 1 from search_menu_items('baboy', 'Japanese') t) into v_found;
  if v_found then
    raise exception 'FAIL the cuisine filter was ignored';
  end if;
  select exists(
    select 1 from search_menu_items('baboy', 'Filipino') t where t.restaurant_id = 'RS-DISH-OPEN'
  ) into v_found;
  if not v_found then
    raise exception 'FAIL the matching cuisine was filtered out';
  end if;
  raise notice 'PASS cuisine filter applies';

  -- An empty query lists nothing: the restaurant list already owns that case.
  select exists(select 1 from search_menu_items('   ') t) into v_found;
  if v_found then
    raise exception 'FAIL an empty query returned dishes';
  end if;
  raise notice 'PASS empty query returns nothing';

  -- A closed kitchen must never sit above an open one that has a match.
  with rows as (
    select t.is_open, row_number() over () as pos
    from search_menu_items('baboy') t
  )
  select (select min(pos) from rows where not is_open) is null
      or (select max(pos) from rows where is_open) is null
      or (select min(pos) from rows where not is_open)
         > (select max(pos) from rows where is_open)
  into v_open_first;
  if v_open_first is not true then
    raise exception 'FAIL a closed kitchen ranked above an open one';
  end if;
  raise notice 'PASS open kitchens rank first';
end $$;

-- Another role cannot use it, even with the right word to type.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated","iss":"https://x.supabase.co/auth/v1"}',
  true
);

do $$ begin
  begin
    perform 1 from search_menu_items('baboy');
    raise exception 'FAIL a merchant was allowed to search dishes';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS customers only';
end $$;

reset role;
rollback;
