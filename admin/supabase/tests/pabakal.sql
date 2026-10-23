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
    perform customer_request_pabakal('[{"store":"Mercury Drug","items":[{"name":"Biogesic","quantity":0}]}]', 'Purok 1, Brgy Example', null, '0917 123 4567');
    raise exception 'FAIL a zero quantity was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform customer_request_pabakal('[{"store":"Mercury Drug","items":[{"name":"Biogesic","quantity":10}]}]', 'Purok 1, Brgy Example', null, 'abc');
    raise exception 'FAIL a bad phone was accepted';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'PASS quantity and phone checked';
end $$;

insert into t_id
  select id from customer_request_pabakal(
    '[{"store":"Mercury Drug","items":[{"name":"Biogesic 500mg","quantity":10}]},
      {"store":"Citi Hardware","items":[{"name":"Light bulb","quantity":2,"price":1}]}]',
    'Purok 1, Brgy Example', null, '0917 123 4567');

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
-- Handing it back before buying (0133) reopens it; taking it again works.
select rider_release_pabakal((select id from t_id));
do $$ begin
  if (select count(*) from rider_open_pabakal() where id = (select id from t_id)) <> 1 then
    raise exception 'FAIL a handed-back pabakal is not open again';
  end if;
  raise notice 'PASS handed back before buying, open again';
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
    perform rider_pabakal_bought((select id from t_id), 100, null);
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
    perform rider_pabakal_bought((select id from t_id), 2000.01, null);
    raise exception 'FAIL a cost over the rider cap was accepted';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'PASS cost capped at what a rider can front';
end $$;
-- 0140: buying needs this rider's receipt photo, actually uploaded.
do $$ begin
  begin
    perform rider_pabakal_bought((select id from t_id), 245.50, null);
    raise exception 'FAIL bought without a receipt photo';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform rider_pabakal_bought((select id from t_id), 245.50, 'R-PBK2/pbk-x-receipt.jpg');
    raise exception 'FAIL bought with somebody else''s photo';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform rider_pabakal_bought((select id from t_id), 245.50,
      'R-PBK1/pbk-' || (select id from t_id) || '-receipt.jpg');
    raise exception 'FAIL bought with a photo that was never uploaded';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'PASS a real receipt photo is required';
end $$;
reset role;
insert into storage.objects (bucket_id, name)
  select 'delivery-proofs', 'R-PBK1/pbk-' || id || '-receipt.jpg' from t_id;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
select rider_pabakal_bought((select id from t_id), 245.50,
  'R-PBK1/pbk-' || (select id from t_id) || '-receipt.jpg');

-- The customer can open their receipt; nothing else in the bucket.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'delivery-proofs') <> 1 then
    raise exception 'FAIL the customer cannot see exactly their own receipt';
  end if;
  raise notice 'PASS the customer sees their receipt';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
do $$ begin
  begin
    perform rider_release_pabakal((select id from t_id));
    raise exception 'FAIL handed back after buying';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'PASS cannot hand back once bought';
end $$;
select rider_pabakal_delivered((select id from t_id), 305.50);

reset role;
do $$ begin
  if (select status::text || '|' || item_cost || '|' || pabakal_fee || '|' || cash_collected || '|' || customer_name
             || '|' || store || '|' || (budget is null) || '|' || (stops -> 1 -> 'items' -> 0)::text
        from pabakal_requests where id = (select id from t_id))
     <> 'delivered|245.50|10.00|305.50|Ana|Mercury Drug, Citi Hardware|true|{"name": "Light bulb", "quantity": 2}' then
    raise exception 'FAIL final row wrong: %',
      (select row_to_json(r) from pabakal_requests r where id = (select id from t_id));
  end if;
  raise notice 'PASS open -> accepted -> delivering -> delivered';
end $$;
-- 0136: an open pabakal nobody took for 30 minutes is cancelled and the
-- customer told in their inbox; a newer one is left alone.
insert into pabakal_requests (reference, customer_user_id, customer_name, delivery_address,
  store, items, status, created_at)
values
  ('#PBK-OLD', '00000000-0000-0000-0000-0000000000f1', 'Ana', 'Purok 1, Brgy Example',
   'Mercury', 'Biogesic', 'open', now() - interval '31 minutes'),
  ('#PBK-NEW', '00000000-0000-0000-0000-0000000000f1', 'Ana', 'Purok 1, Brgy Example',
   'Mercury', 'Neozep', 'open', now() - interval '5 minutes');
do $$ begin
  if expire_open_pabakal() <> 1 then
    raise exception 'FAIL expired the wrong number of pabakal';
  end if;
  if (select status from pabakal_requests where reference = '#PBK-OLD') <> 'cancelled'
     or (select status from pabakal_requests where reference = '#PBK-NEW') <> 'open' then
    raise exception 'FAIL expired the wrong pabakal';
  end if;
  if not exists (select 1 from notifications
                  where user_id = '00000000-0000-0000-0000-0000000000f1'
                    and body like '#PBK-OLD:%') then
    raise exception 'FAIL the customer was not told';
  end if;
  raise notice 'PASS untaken pabakal expire after 30 minutes, customer told';
end $$;
rollback;
