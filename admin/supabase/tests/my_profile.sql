\set ON_ERROR_STOP 1
begin;
-- 0157: a customer and a rider set their own name and photo.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000aa101', 'pf-customer@example.test', '{"name":"Google Name"}'),
  ('00000000-0000-0000-0000-0000000aa102', 'pf-rider@example.test', '{}');
insert into customers (id, name, email, user_id) values ('C-PF', 'Old Name', 'pf-customer@example.test', '00000000-0000-0000-0000-0000000aa101');
insert into riders (id, name, email, user_id) values ('R-PF', 'Old Rider', 'pf-rider@example.test', '00000000-0000-0000-0000-0000000aa102');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000aa101","role":"authenticated"}', true);
select update_my_profile('  Ana   Reyes ', 'https://x.supabase.co/storage/v1/object/public/avatars/00000000-0000-0000-0000-0000000aa101/a.jpg');
do $$ begin
  perform update_my_profile('Ana', 'https://x.supabase.co/storage/v1/object/public/avatars/00000000-0000-0000-0000-0000000aa102/b.jpg');
  raise exception 'FAIL accepted someone else''s photo';
exception when sqlstate '22023' then raise notice 'PASS another person''s photo is refused';
end $$;
do $$ begin
  perform update_my_profile('A', null);
  raise exception 'FAIL accepted a one-letter name';
exception when sqlstate '22023' then raise notice 'PASS too-short name refused';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000aa102","role":"authenticated"}', true);
select update_my_profile('Juan Rider', null);
reset role;

-- A Google sign-in rewrites `name`: the chosen name comes back.
update auth.users set raw_user_meta_data = raw_user_meta_data || '{"name":"Google Again"}'
 where id = '00000000-0000-0000-0000-0000000aa101';

do $$ begin
  if (select name from customers where id = 'C-PF') <> 'Ana Reyes' then raise exception 'FAIL customer name'; end if;
  if (select name from riders where id = 'R-PF') <> 'Juan Rider' then raise exception 'FAIL rider name'; end if;
  if (select raw_user_meta_data ->> 'name' from auth.users where id = '00000000-0000-0000-0000-0000000aa101') <> 'Ana Reyes' then
    raise exception 'FAIL the provider overwrote the chosen name';
  end if;
  if (select raw_user_meta_data ->> 'photo_url' from auth.users where id = '00000000-0000-0000-0000-0000000aa101') not like '%/avatars/00000000-0000-0000-0000-0000000aa101/a.jpg' then
    raise exception 'FAIL photo not saved';
  end if;
  raise notice 'PASS names and photo saved, and the chosen name survives a provider update';
end $$;
rollback;
