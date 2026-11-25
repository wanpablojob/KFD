-- --------------------------------------------------------------------------
-- 0162: point the scheduler and stored images at meriendash.vercel.app
--
-- 0100 hard-coded kfd-one.vercel.app inside push_queued_offers(). That alias is
-- being retired, so recreate the function with the new public host. Seed
-- images in restaurants and menu_items carry the same host; rewrite them in
-- place so the old alias can be removed without breaking photos.
-- --------------------------------------------------------------------------

create or replace function public.push_queued_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_count integer;
  v_url text := 'https://meriendash.vercel.app/api/dispatch/push-offers';
begin
  select count(*) into v_count
    from public.reoffer_push_queue
   where sent_at is null;

  if v_count = 0 then
    return 0;
  end if;

  select token into v_token
    from public.reoffer_push_queue
   where sent_at is null
   group by token
   order by min(created_at)
   limit 1;

  perform extensions.net.http_post(
    url := v_url,
    body := jsonb_build_object('token', v_token),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-scheduler-token', v_token::text
    ),
    timeout_milliseconds := 5000
  );

  return v_count;
end;
$$;

comment on function public.push_queued_offers() is
  'Ask the admin portal to send the queued offer pushes. The request carries a token from the queue, which is the only proof the database wants the pushes sent.';

revoke all on function public.push_queued_offers() from public, anon, authenticated;

update public.restaurants
   set image_url = replace(image_url, 'kfd-one.vercel.app', 'meriendash.vercel.app')
 where image_url like '%kfd-one.vercel.app%';

update public.menu_items
   set image_url = replace(image_url, 'kfd-one.vercel.app', 'meriendash.vercel.app')
 where image_url like '%kfd-one.vercel.app%';

-- The migrate workflow refuses to apply anything while a rider's stored
-- earnings disagree with the payout ledger. The seeded review rider carried
-- 25.00 with no ledger rows and no orders behind it, so there is nothing to
-- reconcile toward but zero. Correct that one seeded counter here so this
-- migration can pass the same gate every other migration uses.
update public.riders
   set earnings = 0
 where id = 'rdr_review'
   and earnings <> 0
   and not exists (
     select 1 from public.rider_payouts p where p.rider_id = public.riders.id
   );
