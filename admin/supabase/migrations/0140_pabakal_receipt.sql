-- --------------------------------------------------------------------------
-- 0140: a pabakal is bought with a photo of the receipt
--
-- The customer pays whatever receipt total the rider types in. That was trust
-- with nothing behind it. Now "bought" needs a photo of the receipt, checked
-- the way a delivery proof is (0079): this rider's photo of this pabakal, and
-- actually uploaded. The customer can open it -- unlike a delivery proof, the
-- receipt is what they are paying -- and so can an admin.
-- --------------------------------------------------------------------------

alter table public.pabakal_requests add column if not exists receipt_path text;

comment on column public.pabakal_requests.receipt_path is
  'Photo of the receipt in the delivery-proofs bucket, <rider>/pbk-<id>-receipt.<ext> (0140).';

drop function if exists public.rider_pabakal_bought(uuid, numeric);
create function public.rider_pabakal_bought(p_id uuid, p_item_cost numeric, p_receipt_path text)
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
    raise exception 'That is over the ₱% a rider can front. Call the customer and KFD before buying more.',
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

comment on function public.rider_pabakal_bought(uuid, numeric, text)
  is 'The rider records the receipt total with a photo of the receipt; checked to be theirs and uploaded (0140).';
revoke all on function public.rider_pabakal_bought(uuid, numeric, text) from public, anon;
grant execute on function public.rider_pabakal_bought(uuid, numeric, text) to authenticated;

-- The customer may open the receipt of their own pabakal, and nothing else in
-- the bucket. Riders and admins read through "read delivery proof" (0079).
drop policy if exists "customers read own pabakal receipt" on storage.objects;
create policy "customers read own pabakal receipt"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'delivery-proofs'
    and exists (
      select 1 from public.pabakal_requests p
       where p.receipt_path = name
         and p.customer_user_id = (select auth.uid())
    )
  );
