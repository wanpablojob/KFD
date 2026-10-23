\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@example.test'),
  ('00000000-0000-0000-0000-0000000000b7', 'paid-rider@example.test');
insert into app_users (user_id, role) values ('00000000-0000-0000-0000-0000000000a1', 'admin')
  on conflict (user_id) do update set role = 'admin';
insert into riders (id, name, email, user_id)
  values ('R-PAY', 'Paid Rider', 'paid-rider@example.test', '00000000-0000-0000-0000-0000000000b7');
-- Only the ledger is under test, not the order flow.
alter table rider_payouts drop constraint rider_payouts_order_id_fkey;
insert into rider_payouts (rider_id, order_id, amount, settlement_state) values
  ('R-PAY', 'O-P1', 40, 'settled'),
  ('R-PAY', 'O-P2', 35, 'settled'),
  ('R-PAY', 'O-P3', 50, 'pending_review'),
  ('R-PAY', 'O-P4', 20, 'disputed'),
  ('R-PAY', 'O-P5', 99, 'reversed');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

do $$ begin
  if (select (owed, owed_count, in_review, paid) is distinct from (75::numeric, 2, 70::numeric, 0::numeric)
        from admin_rider_payout_position('R-PAY')) then
    raise exception 'FAIL position before paying: %',
      (select row_to_json(p) from admin_rider_payout_position('R-PAY') p);
  end if;
  begin
    perform admin_mark_payouts_paid('R-PAY', 'gcash', '  ');
    raise exception 'FAIL GCash without a reference was accepted';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'PASS owed is settled only; GCash needs a reference';
end $$;

do $$ begin
  if (select (paid_count, paid_total) is distinct from (2, 75::numeric)
        from admin_mark_payouts_paid('R-PAY', 'gcash', '1234 567 890')) then
    raise exception 'FAIL marking paid did not pay exactly the settled rows';
  end if;
  if exists (select 1 from rider_payouts where order_id in ('O-P3', 'O-P4', 'O-P5') and paid_at is not null) then
    raise exception 'FAIL a payout in review, disputed or reversed was marked paid';
  end if;
  if (select (owed, paid) is distinct from (0::numeric, 75::numeric)
        from admin_rider_payout_position('R-PAY')) then
    raise exception 'FAIL position after paying';
  end if;
  begin
    perform admin_mark_payouts_paid('R-PAY', 'cash');
    raise exception 'FAIL paid twice';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'PASS pays what is owed, once';
end $$;

-- The rider sees their own position; a rider cannot mark anything paid.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b7","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b7', true);
do $$ begin
  if (select paid from rider_payout_position()) <> 75 then
    raise exception 'FAIL the rider does not see what they were paid';
  end if;
  begin
    perform admin_mark_payouts_paid('R-PAY', 'cash');
    raise exception 'FAIL a rider marked payouts paid';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS rider reads own position, cannot mark paid';
end $$;
rollback;
