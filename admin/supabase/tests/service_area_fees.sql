\set ON_ERROR_STOP 1
begin;

-- order_fees() must return the stored flag, not infer it from a NULL fee.
-- The three NULL-fee cases are what 0084 fixes: "agreed at the door" is the
-- only one allowed through; "refused" and "no band at all" are both refused.
insert into service_areas (barangay, delivery_fee, fee_agreed_in_person) values
  ('Priced', 30.00, false),
  ('Agreed', null, true),
  ('Refused', null, false);

do $$
begin
  if (select delivery_fee from order_fees('Priced')) <> 30.00
     or (select fee_agreed_in_person from order_fees('Priced')) then
    raise exception 'FAIL priced barangay did not return its fee';
  end if;
  raise notice 'PASS priced barangay returns its fee';

  if (select delivery_fee from order_fees('Agreed')) is not null
     or not (select fee_agreed_in_person from order_fees('Agreed')) then
    raise exception 'FAIL agreed-at-the-door barangay was not allowed';
  end if;
  raise notice 'PASS agreed-at-the-door barangay is allowed';

  if (select delivery_fee from order_fees('Refused')) is not null
     or (select fee_agreed_in_person from order_fees('Refused')) then
    raise exception 'FAIL refused barangay reported agreed at the door';
  end if;
  raise notice 'PASS refused barangay is refused';

  if (select fee_agreed_in_person from order_fees('Nowhere')) then
    raise exception 'FAIL unknown barangay reported agreed at the door';
  end if;
  raise notice 'PASS unknown barangay is refused';
end $$;

-- Merchants read refunds for their own restaurant's orders, and only those.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'fee-merchant@example.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'other-merchant@example.test');
insert into restaurants (id, name, cuisine) values
  ('RS-F1', 'Fee Kitchen', 'Filipino'),
  ('RS-F2', 'Other Kitchen', 'Filipino');
insert into app_users (user_id, role, restaurant_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'merchant', 'RS-F1'),
  ('00000000-0000-0000-0000-0000000000f2', 'merchant', 'RS-F2')
  on conflict (user_id) do update set role = excluded.role, restaurant_id = excluded.restaurant_id;
insert into orders (id, reference, customer, restaurant, restaurant_id, status, subtotal, delivery_fee, service_fee, total, payment)
values
  ('O-F1', '#KFD-F1', 'C', 'Fee Kitchen', 'RS-F1', 'delivered', 100, 30, 5, 135, 'cash'),
  ('O-F2', '#KFD-F2', 'C', 'Other Kitchen', 'RS-F2', 'delivered', 100, 30, 5, 135, 'cash');
insert into order_refunds (order_id, amount, method, reason) values
  ('O-F1', 20, 'cash', 'Cold food'),
  ('O-F2', 20, 'cash', 'Cold food');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from order_refunds) <> 1 then
    raise exception 'FAIL merchant saw % refunds, expected 1', (select count(*) from order_refunds);
  end if;
  if (select amount from order_refunds) <> 20 then
    raise exception 'FAIL merchant saw the wrong refund amount';
  end if;
  raise notice 'PASS merchant sees only their own restaurant''s refunds';
end $$;
reset role;

rollback;
