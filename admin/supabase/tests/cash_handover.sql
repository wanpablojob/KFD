\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'admin@example.test');
insert into app_users (user_id, role) values ('00000000-0000-0000-0000-0000000000a1', 'admin')
  on conflict (user_id) do update set role = 'admin';
insert into riders (id, name, email) values ('R-T1', 'Test Rider', 'rider@example.test');
-- Two orders' worth of collections, bypassing the order flow: only the balance math is under test.
alter table rider_cash_collections drop constraint rider_cash_collections_order_id_fkey;
insert into rider_cash_collections (rider_id, order_id, amount_expected, amount_collected, variance)
values ('R-T1', 'O-1', 100, 100, 0), ('R-T1', 'O-2', 100, 90, -10);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
-- On hand 190. Hand over 50 -> 140 left.
select admin_record_cash_handover('R-T1', 50, 'first') is not null as handover_1;
-- 140 is allowed exactly (the buggy join would have computed 280 - 100 = 180 here, or refused wrongly elsewhere).
select admin_record_cash_handover('R-T1', 140, 'rest') is not null as handover_2;
-- Now 0 on hand: 0.01 must be refused with a readable amount.
do $$ begin
  perform admin_record_cash_handover('R-T1', 0.01, 'over');
  raise exception 'FAIL: over-handover accepted';
exception when others then
  if sqlerrm not like '%(0.00 on hand)%' then raise exception 'FAIL: message was %', sqlerrm; end if;
  raise notice 'PASS refused: %', sqlerrm;
end $$;
do $$ begin
  if (select collected::text || '|' || handed_over || '|' || on_hand || '|' || flagged
        from admin_rider_cash() where rider_id = 'R-T1') <> '190.00|190.00|0.00|10.00' then
    raise exception 'FAIL admin cash roster totals wrong';
  end if;
  raise notice 'PASS admin cash roster totals';
end $$;
rollback;
