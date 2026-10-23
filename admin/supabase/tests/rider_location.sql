\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c3', 'loc-rider@example.test'),
  ('00000000-0000-0000-0000-0000000000c4', 'loc-customer@example.test'),
  ('00000000-0000-0000-0000-0000000000c5', 'loc-stranger@example.test');
insert into riders (id, name, email, user_id)
  values ('R-LOC', 'Loc Rider', 'loc-rider@example.test', '00000000-0000-0000-0000-0000000000c3');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
do $$ begin
  if rider_report_location(10.24, 122.82, 15) then
    raise exception 'FAIL a rider with no job was tracked';
  end if;
  raise notice 'PASS no job, no position kept';
end $$;

reset role;
insert into pabakal_requests (id, reference, customer_user_id, customer_name, contact_phone,
  delivery_address, store, items, delivery_fee, pabakal_fee, status, rider_id)
values ('00000000-0000-0000-0000-00000000c0de', '#PBK-LOC1', '00000000-0000-0000-0000-0000000000c4',
  'Loc Customer', '09171234567', 'Purok 1, Brgy Example', 'Mercury', 'Biogesic', 40, 0, 'delivering', 'R-LOC');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
do $$ begin
  if not rider_report_location(10.2401, 122.8202, 12) then
    raise exception 'FAIL a rider on a job was not tracked';
  end if;
  raise notice 'PASS position kept while on a job';
end $$;

-- The customer whose pabakal it is sees the rider.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}', true);
do $$ begin
  if (select latitude from customer_rider_location('#PBK-LOC1')) is distinct from 10.2401 then
    raise exception 'FAIL the customer cannot see their rider';
  end if;
  raise notice 'PASS the customer sees their rider';
end $$;

-- 0139: the customer also gets the rider's name, and a stranger does not.
do $$ begin
  if (select rider_name from pabakal_rider_contact('00000000-0000-0000-0000-00000000c0de')) <> 'Loc Rider' then
    raise exception 'FAIL the customer cannot see their pabakal rider';
  end if;
  raise notice 'PASS the customer sees their pabakal rider';
end $$;

-- Somebody else, with the same reference, does not.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c5","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from customer_rider_location('#PBK-LOC1')) then
    raise exception 'FAIL a stranger saw the rider';
  end if;
  if exists (select 1 from pabakal_rider_contact('00000000-0000-0000-0000-00000000c0de')) then
    raise exception 'FAIL a stranger saw the pabakal rider';
  end if;
  begin
    perform 1 from rider_locations;
    raise exception 'FAIL the table is readable directly';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS nobody else sees the rider';
end $$;

-- A position older than 15 minutes is not shown.
reset role;
update rider_locations set updated_at = now() - interval '20 minutes' where rider_id = 'R-LOC';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from customer_rider_location('#PBK-LOC1')) then
    raise exception 'FAIL a stale position was shown';
  end if;
  raise notice 'PASS stale positions are hidden';
end $$;

-- Delivered: the rider is off the job, and the position is forgotten.
reset role;
update pabakal_requests set status = 'delivered' where reference = '#PBK-LOC1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
do $$ begin
  if rider_report_location(10.25, 122.83, 10) then
    raise exception 'FAIL tracking continued after the job';
  end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from rider_locations where rider_id = 'R-LOC') then
    raise exception 'FAIL the position was kept after the job';
  end if;
  raise notice 'PASS position forgotten after the job';
end $$;
rollback;
