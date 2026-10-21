-- --------------------------------------------------------------------------
-- Two admin processes that stopped halfway
--
-- 1. Website sign-ups. submit_lead (0032) saves the waitlist and the
--    restaurant and rider applications from the landing page, but leads has no
--    policies, so nobody but the service role could ever read them: people who
--    applied on the website were never seen. admin_list_leads lets an admin
--    read them.
--
-- 2. Rider account deletion. A rider can ask in the app (0082) and the admin
--    shows a flag, but finishing it meant hand edits in the Supabase dashboard.
--    admin_close_rider_account does it: refuses while anything is unsettled,
--    strips the personal data, archives the rider and deletes the login. Money
--    records stay, like a customer's self-deletion (0077).
-- --------------------------------------------------------------------------

create or replace function public.admin_list_leads()
returns setof public.leads
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query select * from leads order by created_at desc;
end;
$$;

comment on function public.admin_list_leads()
  is 'Website sign-ups (waitlist, restaurant and rider interest), newest first. Admins only (0111).';

revoke all on function public.admin_list_leads() from public;
revoke all on function public.admin_list_leads() from anon;
grant execute on function public.admin_list_leads() to authenticated;


create or replace function public.admin_close_rider_account(p_rider_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider riders%rowtype;
  v_on_hand numeric;
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  select * into v_rider from riders where id = p_rider_id for update;
  if not found then
    raise exception 'No rider with that id.' using errcode = 'P0001';
  end if;
  if v_rider.deletion_requested_at is null then
    raise exception 'This rider has not asked for their account to be deleted.' using errcode = 'P0001';
  end if;

  if exists (
       select 1 from orders
        where rider_id = p_rider_id
          and status in ('confirmed', 'preparing', 'out_for_delivery'))
     or exists (
       select 1 from deliveries
        where rider_id = p_rider_id
          and status in ('confirmed', 'preparing', 'out_for_delivery')) then
    raise exception 'This rider still has a delivery in progress.' using errcode = 'P0001';
  end if;

  -- Same balance as admin_rider_cash: order cash plus trip cash, less handovers.
  v_on_hand :=
      coalesce((select sum(amount_collected) from rider_cash_collections where rider_id = p_rider_id), 0)
    + coalesce((select sum(amount_collected) from delivery_cash_collections where rider_id = p_rider_id), 0)
    - coalesce((select sum(amount) from rider_cash_handovers where rider_id = p_rider_id), 0);
  if v_on_hand > 0 then
    raise exception 'Record the cash handover first (% on hand).', to_char(v_on_hand, 'FM999999990.00')
      using errcode = 'P0001';
  end if;

  if exists (select 1 from rider_payouts where rider_id = p_rider_id and settlement_state = 'disputed') then
    raise exception 'Resolve this rider''s disputed payouts first.' using errcode = 'P0001';
  end if;

  -- Detach the login BEFORE deleting it: riders.user_id cascades on delete
  -- (0018), which would take the rider row and its payout ledger with it.
  update riders
     set user_id = null,
         name = 'Deleted rider',
         -- email is not null and unique; .invalid can never receive mail.
         email = 'deleted-' || id || '@deleted.invalid',
         phone = null,
         gcash_qr_url = null,
         gcash_name = null,
         status = 'offline',
         archived_at = coalesce(archived_at, now())
   where id = p_rider_id;

  perform public.audit_rider_event(p_rider_id, 'rider.account_closed', null);

  -- Cascades app_users, push_tokens, notifications and the rider application.
  if v_rider.user_id is not null then
    delete from auth.users where id = v_rider.user_id;
  end if;
end;
$$;

comment on function public.admin_close_rider_account(text)
  is 'Finishes a rider''s in-app deletion request (0082): refused while a delivery, cash or a disputed payout is open; strips personal data, archives the rider and deletes the login. Payout and cash records stay (0111).';

revoke all on function public.admin_close_rider_account(text) from public;
revoke all on function public.admin_close_rider_account(text) from anon;
grant execute on function public.admin_close_rider_account(text) to authenticated;
