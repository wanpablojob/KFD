\set ON_ERROR_STOP 1
-- 0145: a rider's delivery photo can actually be uploaded and read back.
--
-- The upload policy used `storage.foldername(name)`, and inside its subquery on
-- public.riders `name` resolved to riders.name -- the rider's display name --
-- not the object path. Every proof upload was refused, which is why the rider
-- could never finish a delivery. This test writes the same path the app does
-- (rider id / order id) as the authenticated rider, so the binding is covered
-- rather than only the policy text.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000145c1', 'proof-one@example.test'),
  ('00000000-0000-0000-0000-0000000145c2', 'proof-two@example.test'),
  ('00000000-0000-0000-0000-0000000145e1', 'proof-admin@example.test');

insert into riders (id, name, email, user_id) values
  ('R-DP1', 'Delivery Proof Rider', 'proof-one@example.test',
   '00000000-0000-0000-0000-0000000145c1'),
  ('R-DP2', 'Another Proof Rider', 'proof-two@example.test',
   '00000000-0000-0000-0000-0000000145c2');

insert into app_users (user_id, role) values
  ('00000000-0000-0000-0000-0000000145e1', 'admin')
  on conflict (user_id) do update set role = excluded.role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000145c1","role":"authenticated"}', true);

-- 1. The rider uploads a proof into their own folder. This is the step the app
--    performs before rider_mark_delivered, and it used to fail for every rider.
insert into storage.objects (bucket_id, name)
  values ('delivery-proofs', 'R-DP1/ord_145.jpg');
do $$ begin
  if (select count(*) from storage.objects
       where bucket_id = 'delivery-proofs' and name = 'R-DP1/ord_145.jpg') <> 1 then
    raise exception 'FAIL the rider cannot read the proof they just uploaded';
  end if;
  raise notice 'PASS a rider uploads and reads their own delivery proof';
end $$;

-- 2. The display name is not a folder. A path built from it is a different
--    first folder and is not the rider's id, so it is still refused.
do $$ begin
  insert into storage.objects (bucket_id, name)
    values ('delivery-proofs', 'Delivery Proof Rider/ord_145.jpg');
  raise exception 'FAIL the rider wrote a path that is not their id';
exception when insufficient_privilege then
  raise notice 'PASS only the rider id folder is writable';
end $$;

-- 3. Another rider can neither write into nor read those photos.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000145c2","role":"authenticated"}', true);
do $$ begin
  insert into storage.objects (bucket_id, name)
    values ('delivery-proofs', 'R-DP1/ord_other.jpg');
  raise exception 'FAIL another rider wrote into R-DP1''s folder';
exception when insufficient_privilege then
  raise notice 'PASS another rider cannot upload into the folder';
end $$;
do $$ begin
  if (select count(*) from storage.objects
       where bucket_id = 'delivery-proofs' and name = 'R-DP1/ord_145.jpg') <> 0 then
    raise exception 'FAIL another rider can read R-DP1''s proof';
  end if;
  raise notice 'PASS another rider cannot read the proof';
end $$;

-- 4. An admin can read it, which is how a cash dispute is settled.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000145e1","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from storage.objects
       where bucket_id = 'delivery-proofs' and name = 'R-DP1/ord_145.jpg') <> 1 then
    raise exception 'FAIL an admin cannot read the delivery proof';
  end if;
  raise notice 'PASS an admin reads the proof';
end $$;

reset role;
rollback;
