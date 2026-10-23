\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d7', 'hours@example.test');
insert into restaurants (id, name, cuisine, city, is_open, status)
  values ('RS-HRS', 'Hours Shop', 'Filipino', 'Kabankalan City Proper', false, 'active'),
         ('RS-NOHRS', 'No Hours', 'Filipino', 'Kabankalan City Proper', true, 'active');
insert into app_users (user_id, role, restaurant_id)
  values ('00000000-0000-0000-0000-0000000000d7', 'merchant', 'RS-HRS')
  on conflict (user_id) do update set role = 'merchant', restaurant_id = 'RS-HRS';

do $$ begin
  if not hours_say_open('08:00', '20:00', '12:00') or hours_say_open('08:00', '20:00', '20:00')
     or not hours_say_open('18:00', '02:00', '01:30') or hours_say_open('18:00', '02:00', '10:00') then
    raise exception 'FAIL day or overnight hours read wrong';
  end if;
  raise notice 'PASS day and overnight hours';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d7","role":"authenticated"}', true);
do $$ begin
  begin
    perform merchant_set_hours('08:00', null);
    raise exception 'FAIL half a schedule was accepted';
  exception when sqlstate '22023' then null;
  end;
  perform merchant_set_hours('08:00', '20:00');
  raise notice 'PASS hours saved, half a schedule refused';
end $$;
reset role;

-- 06:00 Manila (22:00 UTC the day before): closed. 08:00 opens it.
do $$ begin
  update restaurants set is_open = false, schedule_open = false where id = 'RS-HRS';
  perform apply_opening_hours('2026-10-23 00:00:00+00');  -- 08:00 Manila
  if not (select is_open from restaurants where id = 'RS-HRS') then
    raise exception 'FAIL the shop did not open at opening time';
  end if;
  -- The merchant closes early at 15:00; the schedule leaves that alone.
  update restaurants set is_open = false where id = 'RS-HRS';
  perform apply_opening_hours('2026-10-23 07:00:00+00');  -- 15:00 Manila
  if (select is_open from restaurants where id = 'RS-HRS') then
    raise exception 'FAIL the schedule reopened a shop the merchant closed';
  end if;
  -- Closing time, then the next morning: open again.
  perform apply_opening_hours('2026-10-23 12:00:00+00');  -- 20:00 Manila
  perform apply_opening_hours('2026-10-24 00:00:00+00');  -- 08:00 Manila next day
  if not (select is_open from restaurants where id = 'RS-HRS') then
    raise exception 'FAIL the shop did not reopen the next morning';
  end if;
  perform apply_opening_hours('2026-10-24 12:30:00+00');  -- 20:30 Manila
  if (select is_open from restaurants where id = 'RS-HRS') then
    raise exception 'FAIL the shop stayed open after closing time';
  end if;
  if not (select is_open from restaurants where id = 'RS-NOHRS') then
    raise exception 'FAIL a shop with no hours was touched';
  end if;
  raise notice 'PASS opens and closes on time, respects the switch in between';
end $$;
rollback;
