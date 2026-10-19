\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'menu-merchant@example.test');
insert into restaurants (id, name, cuisine) values ('RS-IMG', 'Photo Kitchen', 'Filipino'), ('RS-OTHER', 'Other Kitchen', 'Filipino');
insert into app_users (user_id, role, restaurant_id) values ('00000000-0000-0000-0000-0000000000e1', 'merchant', 'RS-IMG')
  on conflict (user_id) do update set role = excluded.role, restaurant_id = excluded.restaurant_id;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

-- Own folder: allowed. The item itself is created the way the app creates it.
insert into storage.objects (bucket_id, name) values ('menu-images', 'RS-IMG/mnu_1-1.jpg');
insert into menu_items (id, restaurant, restaurant_id, name, category, price, image_url)
values ('mnu_1', 'Photo Kitchen', 'RS-IMG', 'Inasal', 'Mains', 120, 'https://example.test/RS-IMG/mnu_1-1.jpg');
do $$ begin raise notice 'PASS merchant uploads a photo and adds an item for its own restaurant'; end $$;

-- Another restaurant's folder, or another restaurant's menu: refused.
do $$ begin
  insert into storage.objects (bucket_id, name) values ('menu-images', 'RS-OTHER/x.jpg');
  raise exception 'FAIL uploaded into another restaurant''s folder';
exception when insufficient_privilege then raise notice 'PASS cannot upload for another restaurant';
end $$;
do $$ begin
  insert into menu_items (id, restaurant, restaurant_id, name, category, price)
  values ('mnu_2', 'Other Kitchen', 'RS-OTHER', 'Fake', 'Mains', 1);
  raise exception 'FAIL added an item to another restaurant''s menu';
exception when insufficient_privilege then raise notice 'PASS cannot add to another restaurant''s menu';
end $$;
reset role;
rollback;
