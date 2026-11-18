\set ON_ERROR_STOP 1
begin;
-- 0156: the rider page's notes and activity load for an admin.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000ee001', 'na-admin@example.test');
insert into app_users (user_id, role) values ('00000000-0000-0000-0000-0000000ee001', 'admin') on conflict (user_id) do update set role = 'admin';
insert into riders (id, name, email) values ('R-NA', 'NA Rider', 'na-rider@example.test');
insert into rider_notes (rider_id, body, author_user_id) values ('R-NA', 'Called about a late delivery', '00000000-0000-0000-0000-0000000ee001');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000ee001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ee001', true);
select public.audit_rider_event('R-NA', 'rider.note_added', null);
do $$ begin
  if (select author_email from admin_rider_notes('R-NA') limit 1) <> 'na-admin@example.test' then
    raise exception 'FAIL notes did not load with the author email';
  end if;
  if (select count(*) from admin_rider_activity('R-NA')) < 1 then
    raise exception 'FAIL activity did not load';
  end if;
  raise notice 'PASS notes and activity load';
end $$;
rollback;
