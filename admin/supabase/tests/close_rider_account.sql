\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', 'leaving@example.test');
insert into app_users (user_id, role) values ('00000000-0000-0000-0000-0000000000a1', 'admin')
  on conflict (user_id) do update set role = 'admin';
insert into riders (id, name, email, phone, user_id) values
  ('R-BYE', 'Leaving Rider', 'leaving@example.test', '09170000000', '00000000-0000-0000-0000-0000000000d1'),
  ('R-STAY', 'Staying Rider', 'staying@example.test', null, null);
update riders set deletion_requested_at = now() where id = 'R-BYE';
-- Only the money records are under test, not the order flow.
alter table rider_cash_collections drop constraint rider_cash_collections_order_id_fkey;
alter table rider_payouts drop constraint rider_payouts_order_id_fkey;
insert into rider_cash_collections (rider_id, order_id, amount_expected, amount_collected, variance)
values ('R-BYE', 'O-BYE', 150, 150, 0);
insert into rider_payouts (rider_id, order_id, amount) values ('R-BYE', 'O-BYE', 40);
insert into leads (kind, name, contact) values ('rider', 'Web Applicant', '09171111111');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

do $$ begin
  if not exists (select 1 from admin_list_leads() where name = 'Web Applicant') then
    raise exception 'FAIL the admin cannot see a website sign-up';
  end if;
  raise notice 'PASS admin reads leads';
end $$;

do $$ begin
  begin
    perform admin_close_rider_account('R-STAY');
    raise exception 'FAIL closed a rider who never asked';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%has not asked%' then raise; end if;
  end;
  begin
    perform admin_close_rider_account('R-BYE');
    raise exception 'FAIL closed a rider still holding cash';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%(150.00 on hand)%' then raise; end if;
  end;
  raise notice 'PASS refused without a request, and with cash on hand';
end $$;

select admin_record_cash_handover('R-BYE', 150, 'final') is not null as handed_over;
select admin_close_rider_account('R-BYE');

do $$ begin
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000d1') then
    raise exception 'FAIL the login was not deleted';
  end if;
  if (select name || '|' || coalesce(phone, '-') || '|' || (user_id is null) || '|' || (archived_at is not null)
        from riders where id = 'R-BYE') <> 'Deleted rider|-|true|true' then
    raise exception 'FAIL the rider row was not scrubbed and archived';
  end if;
  if not exists (select 1 from rider_payouts where rider_id = 'R-BYE')
     or not exists (select 1 from rider_cash_collections where rider_id = 'R-BYE') then
    raise exception 'FAIL money records went with the login';
  end if;
  raise notice 'PASS login deleted, personal data gone, money records kept';
end $$;

-- A rider (any non-admin) may do neither.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
do $$ begin
  begin
    perform admin_list_leads();
    raise exception 'FAIL a non-admin read leads';
  exception when insufficient_privilege then null;
  end;
  begin
    perform admin_close_rider_account('R-STAY');
    raise exception 'FAIL a non-admin closed an account';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS non-admins refused';
end $$;
rollback;
