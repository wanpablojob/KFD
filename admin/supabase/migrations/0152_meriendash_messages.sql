-- --------------------------------------------------------------------------
-- 0152: the two messages a user can see that named the old brand
--
-- KFD is now Meriendash. Two errors raised by the database are shown to people
-- as written: the account-deletion refusal and the pabakal over-budget refusal.
-- Each function is rebuilt from its live definition with only that word
-- changed; same signature, so its grants stand.
-- --------------------------------------------------------------------------

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to delete your account.' using errcode = '42501';
  end if;

  if not exists (select 1 from app_users where user_id = v_uid and role = 'customer') then
    raise exception 'Rider and restaurant accounts are closed by Meriendash support, because they carry payouts and store access.'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from orders o
     where o.customer_user_id = v_uid
       and o.status in ('pending', 'confirmed', 'preparing', 'out_for_delivery')
  ) then
    raise exception 'You have an order on the way. Delete your account after it arrives.'
      using errcode = '22023';
  end if;

  -- Keep the money records, drop who they were. Orders and the CRM row stay for
  -- accounting; the person's name, phone and address do not.
  update orders
     set customer = 'Deleted customer',
         customer_phone = null,
         delivery_address = null
   where customer_user_id = v_uid;

  update customers
     set name = 'Deleted customer',
         -- email is not null; .invalid is reserved and can never receive mail.
         email = 'deleted-' || id || '@deleted.invalid',
         phone = null,
         archived_at = coalesce(archived_at, now())
   where user_id = v_uid;

  -- Cascades app_users and push_tokens; sets orders.customer_user_id and
  -- customers.user_id to null.
  delete from auth.users where id = v_uid;
end;
$$;

create or replace function public.rider_pabakal_bought(p_id uuid, p_item_cost numeric, p_receipt_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider text := public.current_rider_id();
  v_budget numeric;
  v_max numeric := (select max_cost from pabakal_rules());
  v_path text := nullif(btrim(coalesce(p_receipt_path, '')), '');
begin
  select budget into v_budget from pabakal_requests
   where id = p_id and rider_id = v_rider and status = 'accepted'
   for update;
  if not found then
    raise exception 'That pabakal is not yours to update.' using errcode = '42501';
  end if;
  if p_item_cost is null or p_item_cost <= 0 then
    raise exception 'Enter the receipt total.' using errcode = '22023';
  end if;
  if p_item_cost > least(coalesce(v_budget, v_max), v_max) then
    raise exception 'That is over the ₱% a rider can front. Call the customer and Meriendash before buying more.',
      to_char(least(coalesce(v_budget, v_max), v_max), 'FM999990.00') using errcode = '22023';
  end if;

  if v_path is null then
    raise exception 'Take a photo of the receipt first.' using errcode = '22023';
  end if;
  -- This rider's photo of THIS pabakal, not any file in the bucket.
  if v_path not in (
    v_rider || '/pbk-' || p_id || '-receipt.jpg',
    v_rider || '/pbk-' || p_id || '-receipt.png',
    v_rider || '/pbk-' || p_id || '-receipt.webp'
  ) then
    raise exception 'That receipt photo does not belong to this pabakal. Take it again.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o where o.bucket_id = 'delivery-proofs' and o.name = v_path
  ) then
    raise exception 'The receipt photo was not found. Upload it again.' using errcode = 'P0001';
  end if;

  update pabakal_requests
     set status = 'delivering',
         item_cost = round(p_item_cost, 2),
         receipt_path = v_path,
         bought_at = now()
   where id = p_id;
end;
$$;
