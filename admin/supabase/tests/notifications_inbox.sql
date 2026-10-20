\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'inbox-a@example.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'inbox-b@example.test');
-- The server writes these with the service role.
insert into notifications (user_id, title, body, data) values
  ('00000000-0000-0000-0000-0000000000f1', 'Order on the way', 'A', '{"reference":"#KFD-A"}'),
  ('00000000-0000-0000-0000-0000000000f2', 'Order on the way', 'B', '{"reference":"#KFD-B"}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

do $$ begin
  if (select count(*) from notifications) <> 1 then
    raise exception 'FAIL a user can see other users'' notifications';
  end if;
  update notifications set read_at = now();
  if (select count(*) from notifications where read_at is not null) <> 1 then
    raise exception 'FAIL a user could not mark their own notification read';
  end if;
  raise notice 'PASS users see and mark only their own notifications';
end $$;

do $$ begin
  insert into notifications (user_id, title, body) values ('00000000-0000-0000-0000-0000000000f1', 'Fake', 'x');
  raise exception 'FAIL a client created a notification';
exception when insufficient_privilege then raise notice 'PASS clients cannot create notifications';
end $$;

do $$ begin
  update notifications set title = 'changed';
  raise exception 'FAIL a client changed a notification''s text';
exception when insufficient_privilege then raise notice 'PASS clients can change read state only';
end $$;
reset role;
rollback;
