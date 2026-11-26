-- --------------------------------------------------------------------------
-- 0163: a refund request carries a photo and says who it is against
--
-- A request (0159) was a line of text sent to the admins. Now the customer:
--
--   * attaches a photo of the problem (the food, the bag), uploaded to the
--     private refund-photos bucket under their own folder; and
--   * picks who it is against: the shop (the food was wrong) or the rider
--     (the delivery was).
--
-- A request against the shop goes to that shop's merchant, who approves or
-- declines it (merchant_resolve_refund_request). A request against the rider
-- stays with the admins (admin_resolve_refund_request), who can still settle
-- either kind.
-- --------------------------------------------------------------------------

alter table public.refund_requests
  add column if not exists against text not null default 'merchant'
    check (against in ('merchant', 'rider')),
  add column if not exists photo_path text;

comment on column public.refund_requests.against is
  'Who the problem is with: merchant (the food) or rider (the delivery). Merchant requests are answered by the shop (0163).';
comment on column public.refund_requests.photo_path is
  'Photo of the problem in the refund-photos bucket, <customer uid>/<order id>-<n>.<ext> (0163).';

-- The shop sees requests against it, for its own orders.
drop policy if exists "merchants read own refund requests" on public.refund_requests;
create policy "merchants read own refund requests"
  on public.refund_requests for select to authenticated
  using (
    against = 'merchant'
    and exists (
      select 1 from public.orders o
       where o.id = refund_requests.order_id
         and o.restaurant_id = (select public.current_merchant_restaurant())
    )
  );

-- --------------------------------------------------------------------------
-- The bucket: private, images only, 5 MB
-- --------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('refund-photos', 'refund-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- objects.name is qualified on purpose: unqualified, a subquery alias can
-- capture it (see 0145).
drop policy if exists "customers upload own refund photo" on storage.objects;
create policy "customers upload own refund photo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'refund-photos'
    and (storage.foldername(objects.name))[1] = (select auth.uid())::text
  );

drop policy if exists "read refund photo" on storage.objects;
create policy "read refund photo"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'refund-photos'
    and (
      (storage.foldername(objects.name))[1] = (select auth.uid())::text
      or (select public.is_platform_admin())
      or exists (
        select 1
          from public.refund_requests q
          join public.orders o on o.id = q.order_id
         where q.photo_path = objects.name
           and q.against = 'merchant'
           and o.restaurant_id = (select public.current_merchant_restaurant())
      )
    )
  );

-- --------------------------------------------------------------------------
-- request_refund: now with who it is against and the photo
-- --------------------------------------------------------------------------
drop function if exists public.request_refund(text, text);
create function public.request_refund(
  p_order_id text,
  p_reason text,
  p_against text,
  p_photo_path text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row orders;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_path text := nullif(btrim(coalesce(p_photo_path, '')), '');
  v_refunded numeric;
  v_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Sign in to ask for a refund.' using errcode = '42501';
  end if;
  if p_against is null or p_against not in ('merchant', 'rider') then
    raise exception 'Say whether the problem was the food or the delivery.' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'Tell us what went wrong.' using errcode = '22023';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters.' using errcode = '22023';
  end if;
  if v_path is null then
    raise exception 'Add a photo of the problem.' using errcode = '22023';
  end if;
  -- This customer's photo of THIS order, and actually uploaded.
  if v_path not like auth.uid()::text || '/' || p_order_id || '-%' then
    raise exception 'That photo does not belong to this order. Add it again.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o where o.bucket_id = 'refund-photos' and o.name = v_path
  ) then
    raise exception 'The photo was not found. Add it again.' using errcode = 'P0001';
  end if;

  select * into v_row from orders o where o.id = p_order_id for update;
  if not found or v_row.customer_user_id is distinct from auth.uid() then
    raise exception 'Order not found.' using errcode = 'P0001';
  end if;
  if v_row.status not in ('delivered', 'cancelled') then
    raise exception 'You can ask for a refund once the order is delivered or cancelled.'
      using errcode = 'P0001';
  end if;
  if v_row.status = 'cancelled' and v_row.payment = 'cash' then
    raise exception 'Nothing was paid for this cancelled cash order, so there is nothing to refund.'
      using errcode = 'P0001';
  end if;
  if p_against = 'rider' and v_row.rider_id is null then
    raise exception 'No rider delivered this order. Choose the food instead.' using errcode = '22023';
  end if;
  if v_row.placed_at < now() - interval '7 days' then
    raise exception 'Refunds can be asked for within 7 days of ordering.' using errcode = 'P0001';
  end if;

  select coalesce(sum(r.amount), 0) into v_refunded
    from order_refunds r where r.order_id = p_order_id;
  if v_refunded >= v_row.total then
    raise exception 'This order has already been fully refunded.' using errcode = 'P0001';
  end if;
  if exists (select 1 from refund_requests q
              where q.order_id = p_order_id and q.status = 'pending') then
    raise exception 'You already asked for a refund on this order. We will reply.'
      using errcode = 'P0001';
  end if;

  insert into refund_requests (order_id, customer_user_id, reason, against, photo_path)
  values (p_order_id, auth.uid(), v_reason, p_against, v_path)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.request_refund(text, text, text, text) is
  'Customer asks for a refund on their own delivered, or paid-and-cancelled, order within 7 days, against the shop or the rider, with a photo (0159, 0163).';
revoke all on function public.request_refund(text, text, text, text) from public, anon;
grant execute on function public.request_refund(text, text, text, text) to authenticated;

-- --------------------------------------------------------------------------
-- merchant_resolve_refund_request: the shop answers a request about its food
--
-- admin_record_refund is admin-only (and since 0161 not callable at all), so
-- the ledger row is written here, under the same order-total cap.
-- --------------------------------------------------------------------------
create or replace function public.merchant_resolve_refund_request(
  p_request_id bigint,
  p_approve boolean,
  p_amount numeric default null,
  p_method text default null,
  p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req refund_requests;
  v_shop text := public.current_merchant_restaurant();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_total numeric;
  v_refunded numeric;
  v_refund_id bigint;
begin
  if v_shop is null then
    raise exception 'Merchants only.' using errcode = '42501';
  end if;

  select q.* into v_req
    from refund_requests q
    join orders o on o.id = q.order_id
   where q.id = p_request_id and q.against = 'merchant' and o.restaurant_id = v_shop
   for update of q;
  if not found then
    raise exception 'Refund request not found.' using errcode = 'P0001';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request was already %.', v_req.status using errcode = 'P0001';
  end if;

  if p_approve then
    if p_amount is null or p_amount <= 0 then
      raise exception 'Refund amount must be more than zero.' using errcode = '22023';
    end if;
    if p_method is null or p_method not in ('cash', 'gcash') then
      raise exception 'Refund method must be cash or gcash.' using errcode = '22023';
    end if;
    -- Lock the order so two refunds cannot pass the total at once.
    select o.total into v_total from orders o where o.id = v_req.order_id for update;
    select coalesce(sum(r.amount), 0) into v_refunded
      from order_refunds r where r.order_id = v_req.order_id;
    if v_refunded + p_amount > v_total then
      raise exception 'That would refund more than the order total (% already refunded of %).',
        v_refunded, v_total using errcode = '22023';
    end if;
    insert into order_refunds (order_id, amount, method, reason, recorded_by)
    values (v_req.order_id, round(p_amount, 2), p_method,
            coalesce(v_note, v_req.reason), auth.uid())
    returning order_refunds.id into v_refund_id;
  elsif v_note is null then
    raise exception 'Say why it is declined. The customer sees it.' using errcode = '22023';
  end if;

  update refund_requests q
     set status = case when p_approve then 'approved' else 'declined' end,
         amount = case when p_approve then round(p_amount, 2) end,
         admin_note = v_note,
         resolved_at = now(),
         resolved_by = auth.uid()
   where q.id = p_request_id;

  insert into audit_log (table_name, action, event, detail, actor_user_id)
  values ('refund_requests', 'update',
          case when p_approve then 'refund_request.approved' else 'refund_request.declined' end,
          jsonb_build_object('request_id', v_req.id,
                             'order_id', v_req.order_id,
                             'by', 'merchant',
                             'amount', case when p_approve then round(p_amount, 2) end,
                             'method', case when p_approve then p_method end,
                             'note', v_note),
          auth.uid());

  return v_refund_id;
end;
$$;

comment on function public.merchant_resolve_refund_request(bigint, boolean, numeric, text, text) is
  'The shop approves (recording the refund, capped at the order total) or declines a refund request about its food (0163).';
revoke all on function public.merchant_resolve_refund_request(bigint, boolean, numeric, text, text)
  from public, anon;
grant execute on function public.merchant_resolve_refund_request(bigint, boolean, numeric, text, text)
  to authenticated;
