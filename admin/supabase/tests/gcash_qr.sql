\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'qr-rider@example.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'qr-other@example.test'),
  ('00000000-0000-0000-0000-0000000000d3', 'qr-customer@example.test');
insert into riders (id, name, email, user_id) values
  ('R-QR1', 'QR Rider', 'qr-rider@example.test', '00000000-0000-0000-0000-0000000000d1'),
  ('R-QR2', 'Other Rider', 'qr-other@example.test', '00000000-0000-0000-0000-0000000000d2');

do $$ begin
  if not exists (
    select 1 from storage.buckets where id = 'gcash-qr' and public
  ) then
    raise exception 'FAIL the gcash-qr bucket is missing or not public';
  end if;
  raise notice 'PASS gcash-qr is a public bucket';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

-- Own folder: allowed. The rider then points the existing payout field at it.
insert into storage.objects (bucket_id, name) values ('gcash-qr', 'R-QR1/qr.png');
select rider_set_gcash(
  'https://x.supabase.co/storage/v1/object/public/gcash-qr/R-QR1/qr.png',
  'QR Rider'
);
do $$ begin
  if (select gcash_qr_url from riders where id = 'R-QR1')
     not like '%/gcash-qr/R-QR1/%' then
    raise exception 'FAIL the rider''s QR URL was not saved';
  end if;
  if (select gcash_name from riders where id = 'R-QR1') <> 'QR Rider' then
    raise exception 'FAIL the GCash name was not saved';
  end if;
  raise notice 'PASS rider stores a QR in their own folder';
end $$;

-- Another rider's folder is refused by the path check.
do $$ begin
  insert into storage.objects (bucket_id, name) values ('gcash-qr', 'R-QR2/qr.png');
  raise exception 'FAIL uploaded into another rider''s folder';
exception when insufficient_privilege then
  raise notice 'PASS cannot upload into another rider''s folder';
end $$;

-- A signed-in customer has no active rider id, so the bucket is closed to them.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
do $$ begin
  insert into storage.objects (bucket_id, name) values ('gcash-qr', 'R-QR1/not-mine.png');
  raise exception 'FAIL a customer wrote into the rider bucket';
exception when insufficient_privilege then
  raise notice 'PASS a customer cannot write into the rider bucket';
end $$;

-- The RPC updates the calling rider's row only, never someone else's.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
select rider_set_gcash(
  'https://x.supabase.co/storage/v1/object/public/gcash-qr/R-QR2/qr.png',
  'Other Rider'
);
do $$ begin
  if (select gcash_name from riders where id = 'R-QR1') <> 'QR Rider' then
    raise exception 'FAIL another rider changed R-QR1';
  end if;
  if (select gcash_name from riders where id = 'R-QR2') <> 'Other Rider' then
    raise exception 'FAIL R-QR2 could not set their own QR';
  end if;
  raise notice 'PASS rider_set_gcash only touches the calling rider';
end $$;

-- A rider whose account is no longer active is not handed a write path. The
-- suspension guard is a direct-write guard, so this is set as postgres; the
-- helper reads the column, it does not write it.
reset role;
select set_config('kfd.rider_suspension_write', 'on', true);
update riders set suspended_at = now() where id = 'R-QR1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$ begin
  insert into storage.objects (bucket_id, name) values ('gcash-qr', 'R-QR1/suspended.png');
  raise exception 'FAIL a suspended rider uploaded a QR';
exception when insufficient_privilege then
  raise notice 'PASS a suspended rider cannot upload a QR';
end $$;

reset role;
rollback;
