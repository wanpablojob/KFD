-- --------------------------------------------------------------------------
-- 0136: a pabakal nobody takes does not wait forever
--
-- An open pabakal stayed open until a rider took it or an admin cancelled it.
-- A customer whose request nobody took was left waiting with no answer. After
-- 30 minutes with no rider it is now cancelled, and the customer is told in
-- the app's notification inbox (a scheduled job cannot send a push; the inbox
-- is written here directly, and My pabakal shows the reason).
-- --------------------------------------------------------------------------

create or replace function public.expire_open_pabakal()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update pabakal_requests
       set status = 'cancelled',
           cancelled_at = now(),
           cancel_reason = 'No rider was free to take it. Please try again.'
     where status = 'open'
       and created_at < now() - interval '30 minutes'
    returning reference, customer_user_id
  ), told as (
    insert into notifications (user_id, title, body, data)
    select customer_user_id,
           'Pabakal cancelled',
           reference || ': no rider was free to take it. Please try again.',
           jsonb_build_object('type', 'pabakal_status')
      from expired
     where customer_user_id is not null
    returning 1
  )
  select count(*)::int into v_count from expired;
  return v_count;
end;
$$;

comment on function public.expire_open_pabakal()
  is 'Cancels pabakal open for 30 minutes with no rider, and tells each customer in their inbox (0136). Run every minute by pg_cron.';
revoke all on function public.expire_open_pabakal() from public, anon, authenticated;

do $$
declare
  v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname = 'expire-open-pabakal' loop
    perform cron.unschedule(v_jobid);
  end loop;
end $$;

select cron.schedule(
  'expire-open-pabakal',
  '* * * * *',
  $job$
    select public.expire_open_pabakal();
  $job$
);
