-- --------------------------------------------------------------------------
-- 0133: a rider can hand a pabakal back before buying
--
-- A rider who took a pabakal and then cannot do it (the store is closed, the
-- bike broke down) had no way out: only an admin could cancel it, and until
-- then the customer's request sat with a rider who was not coming.
--
-- Before buying, nothing has been spent, so the job simply goes back to the
-- open list for another rider. After buying the rider has spent their own
-- money on the customer's items, so they deliver it, or an admin cancels.
-- --------------------------------------------------------------------------

create or replace function public.rider_release_pabakal(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update pabakal_requests
     set status = 'open', rider_id = null, accepted_at = null
   where id = p_id
     and rider_id = public.current_rider_id()
     and status = 'accepted';
  if not found then
    raise exception 'You can only hand a pabakal back before buying it.' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.rider_release_pabakal(uuid)
  is 'The assigned rider hands a pabakal back before buying; it returns to the open list (0133).';

revoke all on function public.rider_release_pabakal(uuid) from public, anon;
grant execute on function public.rider_release_pabakal(uuid) to authenticated;
