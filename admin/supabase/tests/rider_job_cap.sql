\set ON_ERROR_STOP 1
begin;
-- 0148: a rider carries up to two jobs, is Busy at two, and Online again below.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'cap@example.test');
insert into restaurants (id, name, cuisine, city) values ('RS-CAP', 'Cap Kitchen', 'Filipino', 'Kabankalan');
insert into riders (id, name, email, user_id, city, status) values
  ('R-CAP', 'Cap', 'cap@example.test', '00000000-0000-0000-0000-0000000000c1', 'Kabankalan', 'online');
insert into orders (id, reference, customer, restaurant, restaurant_id, status, rider_id, subtotal, delivery_fee, service_fee, total, payment) values
  ('O-C1', '#KFD-C1', 'C', 'Cap Kitchen', 'RS-CAP', 'confirmed', null, 100, 45, 5, 150, 'cash'),
  ('O-C2', '#KFD-C2', 'C', 'Cap Kitchen', 'RS-CAP', 'confirmed', null, 100, 45, 5, 150, 'cash'),
  ('O-C3', '#KFD-C3', 'C', 'Cap Kitchen', 'RS-CAP', 'confirmed', null, 100, 45, 5, 150, 'cash');
select offer_order_to_riders('O-C1'), offer_order_to_riders('O-C2'), offer_order_to_riders('O-C3');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select order_id from claim_order('O-C1');
reset role;

do $$ begin
  if (select status::text from riders where id = 'R-CAP') <> 'online' then
    raise exception 'FAIL one job should leave the rider online';
  end if;
  if not exists (select 1 from order_offers where order_id = 'O-C2' and rider_id = 'R-CAP' and status = 'offered') then
    raise exception 'FAIL a rider with one job should keep their other offers';
  end if;
  raise notice 'PASS one job: still online, still offered';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select order_id from claim_order('O-C2');
reset role;

do $$ begin
  if (select status::text || '/' || auto_busy::text from riders where id = 'R-CAP') <> 'busy/true' then
    raise exception 'FAIL two jobs should make the rider busy, set by the system';
  end if;
  if (select status::text from order_offers where order_id = 'O-C2' and rider_id = 'R-CAP') <> 'claimed' then
    raise exception 'FAIL the offer just claimed must stay claimed, not expired';
  end if;
  if exists (select 1 from order_offers where order_id = 'O-C3' and rider_id = 'R-CAP' and status = 'offered') then
    raise exception 'FAIL a busy rider''s other offers should lapse';
  end if;
  if offer_order_to_riders('O-C3') <> 0 then
    raise exception 'FAIL a rider with two jobs was offered a third';
  end if;
  raise notice 'PASS two jobs: busy, other offers gone, nothing new offered';
end $$;

-- A third job is refused however it is assigned.
do $$ begin
  update orders set rider_id = 'R-CAP' where id = 'O-C3';
  raise exception 'FAIL a third job was assigned';
exception when others then
  if sqlerrm not like '%already have 2 deliveries%' then raise exception 'FAIL: %', sqlerrm; end if;
  raise notice 'PASS a third job is refused';
end $$;

-- Going Online by hand while carrying two is held at Busy.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select rider_set_status('online');
reset role;
do $$ begin
  if (select status::text from riders where id = 'R-CAP') <> 'busy' then
    raise exception 'FAIL a rider carrying two went online by hand';
  end if;
  raise notice 'PASS online by hand with two jobs stays busy';
end $$;

-- Finishing one job puts a system-Busy rider back Online.
update orders set status = 'delivered' where id = 'O-C1';
do $$ begin
  if (select status::text || '/' || auto_busy::text from riders where id = 'R-CAP') <> 'online/false' then
    raise exception 'FAIL finishing a job should put the rider back online';
  end if;
  if offer_order_to_riders('O-C3') <> 1 then
    raise exception 'FAIL a rider back to one job should be offered work again';
  end if;
  raise notice 'PASS finishing a job: online and offered again';
end $$;

-- A Busy the rider chose is left alone when a job ends.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select rider_set_status('busy');
reset role;
update orders set status = 'delivered' where id = 'O-C2';
do $$ begin
  if (select status::text || '/' || auto_busy::text from riders where id = 'R-CAP') <> 'busy/false' then
    raise exception 'FAIL a Busy the rider chose was undone by the system';
  end if;
  raise notice 'PASS a rider''s own Busy is kept';
end $$;

rollback;
