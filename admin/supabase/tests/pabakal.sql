\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'pbk-customer@example.test', '{"name":"Ana"}'),
  ('00000000-0000-0000-0000-0000000000f2', 'pbk-rider@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000000f3', 'pbk-rider2@example.test', '{}');
insert into app_users (user_id, role) values ('00000000-0000-0000-0000-0000000000f1', 'customer')
  on conflict (user_id) do update set role = 'customer', restaurant_id = null;
insert into riders (id, name, email, user_id) values
  ('R-PBK1', 'Pabakal Rider', 'pbk-rider@example.test', '00000000-0000-0000-0000-0000000000f2'),
  ('R-PBK2', 'Other Rider', 'pbk-rider2@example.test', '00000000-0000-0000-0000-0000000000f3');

create temp table t_id (id uuid);
grant all on t_id to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

do $$ begin
  begin
    perform customer_request_pabakal('Mercury Drug', 'Biogesic x10', 999999, 'Purok 1, Brgy Example');
    raise exception 'FAIL a budget over the cap was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform customer_request_pabakal('Mercury Drug', 'Biogesic x10', 300, 'Purok 1, Brgy Example', null, 'abc');
    raise exception 'FAIL a bad phone was accepted';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'PASS budget cap and phone checked';
end $$;

insert into t_id
  select id from customer_request_pabakal('Mercury Drug', 'Biogesic x10', 300, 'Purok 1, Brgy Example', null, '0917 123 4567');

-- Rider sees the job without the customer's details, takes it, buys, delivers.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
do $$ begin
  if not exists (select 1 from rider_open_pabakal() where id = (select id from t_id)) then
    raise exception 'FAIL the rider cannot see the open pabakal';
  end if;
  if exists (select 1 from pabakal_requests where id = (select id from t_id)) then
    raise exception 'FAIL the rider read the customer''s row before taking it';
  end if;
  raise notice 'PASS open job listed, personal details hidden';
end $$;
select rider_claim_pabakal((select id from t_id));

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}', true);
do $$ begin
  begin
    perform rider_claim_pabakal((select id from t_id));
    raise exception 'FAIL a second rider took a taken job';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform rider_pabakal_bought((select id from t_id), 100);
    raise exception 'FAIL another rider updated the job';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS one rider per job';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
do $$ begin
  begin
    perform customer_cancel_pabakal((select id from t_id));
    raise exception 'FAIL cancelled after a rider took it';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'PASS no cancel once taken';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
do $$ begin
  begin
    perform rider_pabakal_bought((select id from t_id), 300.01);
    raise exception 'FAIL a cost over the budget was accepted';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'PASS cost capped at the budget';
end $$;
select rider_pabakal_bought((select id from t_id), 245.50);
select rider_pabakal_delivered((select id from t_id), 305.50);

reset role;
do $$ begin
  if (select status::text || '|' || item_cost || '|' || pabakal_fee || '|' || cash_collected || '|' || customer_name
        from pabakal_requests where id = (select id from t_id))
     <> 'delivered|245.50|20.00|305.50|Ana' then
    raise exception 'FAIL final row wrong: %',
      (select row_to_json(r) from pabakal_requests r where id = (select id from t_id));
  end if;
  raise notice 'PASS open -> accepted -> delivering -> delivered';
end $$;
rollback;
