\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e9', 'shop-photo@example.test');
insert into restaurants (id, name, cuisine) values ('RS-PIC', 'Photo Shop', 'Filipino'), ('RS-OTHER2', 'Other', 'Filipino');
insert into app_users (user_id, role, restaurant_id) values ('00000000-0000-0000-0000-0000000000e9', 'merchant', 'RS-PIC')
  on conflict (user_id) do update set role = excluded.role, restaurant_id = excluded.restaurant_id;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e9","role":"authenticated"}', true);

select merchant_set_shop_image('https://x.supabase.co/storage/v1/object/public/menu-images/RS-PIC/a.jpg');
do $$ begin
  begin
    perform merchant_set_shop_image('https://evil.example/RS-PIC/a.jpg');
    raise exception 'FAIL an outside URL was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform merchant_set_shop_image('https://x.supabase.co/storage/v1/object/public/menu-images/RS-OTHER2/a.jpg');
    raise exception 'FAIL another restaurant''s folder was accepted';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'PASS only the merchant''s own uploaded photo is accepted';
end $$;
reset role;

do $$ begin
  if (select image_url from restaurants where id = 'RS-PIC') not like '%/menu-images/RS-PIC/a.jpg' then
    raise exception 'FAIL the shop photo was not saved';
  end if;
  if (select image_url from restaurants where id = 'RS-OTHER2') is not null then
    raise exception 'FAIL another restaurant was changed';
  end if;
  raise notice 'PASS photo saved on the merchant''s restaurant only';
end $$;
rollback;
