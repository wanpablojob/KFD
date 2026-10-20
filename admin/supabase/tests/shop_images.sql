\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e9', 'shop-photo@example.test'),
  ('00000000-0000-0000-0000-0000000000e8', 'shop-photo-customer@example.test');
insert into restaurants (id, name, cuisine) values
  ('RS-PIC', 'Photo Shop', 'Filipino'),
  ('RS-OTHER2', 'Other', 'Filipino');
insert into app_users (user_id, role, restaurant_id) values
  ('00000000-0000-0000-0000-0000000000e9', 'merchant', 'RS-PIC')
  on conflict (user_id) do update set role = excluded.role, restaurant_id = excluded.restaurant_id;
insert into app_users (user_id, role) values
  ('00000000-0000-0000-0000-0000000000e8', 'customer')
  on conflict (user_id) do update set role = excluded.role, restaurant_id = null;
insert into storage.objects (bucket_id, name) values ('menu-images', 'RS-PIC/a.jpg');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e9","role":"authenticated","iss":"https://x.supabase.co/auth/v1"}',
  true
);

select merchant_set_shop_image('https://x.supabase.co/storage/v1/object/public/menu-images/RS-PIC/a.jpg');

do $$ begin
  begin
    perform merchant_set_shop_image('https://evil.example/storage/v1/object/public/menu-images/RS-PIC/a.jpg');
    raise exception 'FAIL an outside host was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform merchant_set_shop_image('https://x.supabase.co/storage/v1/object/public/menu-images/RS-PIC/../RS-OTHER2/a.jpg');
    raise exception 'FAIL a path traversal was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform merchant_set_shop_image('https://x.supabase.co/storage/v1/object/public/menu-images/RS-PIC/%2e%2e/RS-OTHER2/a.jpg');
    raise exception 'FAIL an encoded traversal was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform merchant_set_shop_image('https://x.supabase.co/storage/v1/object/public/menu-images/RS-OTHER2/a.jpg');
    raise exception 'FAIL another restaurant''s folder was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform merchant_set_shop_image('https://x.supabase.co/storage/v1/object/public/menu-images/RS-PIC/missing.jpg');
    raise exception 'FAIL a URL with no uploaded object was accepted';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'PASS only an existing upload in the merchant''s own folder is accepted';
end $$;

select merchant_set_shop_image(null);

reset role;
do $$ begin
  if (select image_url from restaurants where id = 'RS-PIC') is not null then
    raise exception 'FAIL the shop photo was not cleared';
  end if;
  if (select image_url from restaurants where id = 'RS-OTHER2') is not null then
    raise exception 'FAIL another restaurant was changed';
  end if;
  raise notice 'PASS clearing the shop photo';
end $$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e9","role":"authenticated","iss":"https://x.supabase.co/auth/v1"}',
  true
);
select merchant_set_shop_image('https://x.supabase.co/storage/v1/object/public/menu-images/RS-PIC/a.jpg');
reset role;

do $$ begin
  if (select image_url from restaurants where id = 'RS-PIC')
     is distinct from 'https://x.supabase.co/storage/v1/object/public/menu-images/RS-PIC/a.jpg' then
    raise exception 'FAIL the shop photo was not saved';
  end if;
  if (select image_url from restaurants where id = 'RS-OTHER2') is not null then
    raise exception 'FAIL another restaurant was changed';
  end if;
  raise notice 'PASS photo saved on the merchant''s restaurant only';
end $$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e8","role":"authenticated"}',
  true
);
do $$ declare
  v_own text;
  v_other text;
begin
  select image_url into v_own from search_restaurants() where id = 'RS-PIC';
  select image_url into v_other from search_restaurants() where id = 'RS-OTHER2';
  if v_own is distinct from 'https://x.supabase.co/storage/v1/object/public/menu-images/RS-PIC/a.jpg' then
    raise exception 'FAIL the customer search did not return the shop photo';
  end if;
  if v_other is distinct from '' then
    raise exception 'FAIL a shop without a photo returned a non-empty image_url';
  end if;
  raise notice 'PASS customer search returns the photo and an empty string when absent';
end $$;
reset role;
rollback;
