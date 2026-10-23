\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@example.test'),
  ('00000000-0000-0000-0000-0000000000a9', 'not-admin@example.test');
insert into app_users (user_id, role) values ('00000000-0000-0000-0000-0000000000a1', 'admin')
  on conflict (user_id) do update set role = 'admin';
insert into riders (id, name, email) values ('R-AUD', 'Audit Rider', 'aud@example.test');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select admin_set_rider_suspended('R-AUD', true, 'Late cash');

do $$ begin
  if not exists (
    select 1 from admin_audit_log(10)
     where event = 'rider.suspended' and rider_id = 'R-AUD'
       and actor_email = 'admin@example.test' and detail ->> 'reason' = 'Late cash'
  ) then
    raise exception 'FAIL the suspension is not in the log with its actor';
  end if;
  raise notice 'PASS admin reads the log with the actor''s email';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a9', true);
do $$ begin
  begin
    perform admin_audit_log(10);
    raise exception 'FAIL a non-admin read the log';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS non-admins refused';
end $$;
rollback;
