-- --------------------------------------------------------------------------
-- 0159: customers can ask for a refund, and admins approve or decline it
--
-- Refunds were admin-only (0078): money went back only when an admin noticed,
-- and a customer had no way to ask but a message. Now:
--
--   * request_refund: the customer asks on one shop's order, with a reason.
--     Only their own order, delivered or cancelled after paying (a cancelled
--     cash order took no money), within 7 days, not already fully refunded,
--     and one open request per order at a time.
--   * admin_resolve_refund_request: an admin approves it -- which records the
--     refund through admin_record_refund, so the order-total cap still holds --
--     or declines it with a note the customer sees. Both go in the activity log.
--
-- A trip from several shops is one order per shop (0092), so a request is per
-- shop: the customer says which shop's food was wrong.
-- --------------------------------------------------------------------------

create table if not exists public.refund_requests (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders (id) on delete cascade,
  customer_user_id uuid not null,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  -- What was refunded, on approval.
  amount numeric(10, 2),
  -- Why it was declined, or a note on the approval; the customer sees it.
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);

create unique index if not exists refund_requests_one_open
  on public.refund_requests (order_id) where status = 'pending';
create index if not exists refund_requests_order_idx
  on public.refund_requests (order_id);

comment on table public.refund_requests is
  'A customer asking for money back on one order (0159). Written only through request_refund and admin_resolve_refund_request.';

alter table public.refund_requests enable row level security;
drop policy if exists "admins read refund requests" on public.refund_requests;
create policy "admins read refund requests"
  on public.refund_requests for select to authenticated
  using ((select public.is_platform_admin()));
drop policy if exists "customers read own refund requests" on public.refund_requests;
create policy "customers read own refund requests"
  on public.refund_requests for select to authenticated
  using (customer_user_id = (select auth.uid()));
-- Supabase grants ALL on new public tables to anon and authenticated by
-- default (0088/0089). RLS blocks DML, but TRUNCATE ignores RLS, and anon must
-- not see customers' refund reasons at all: keep only the SELECT the UI needs.
revoke all on table public.refund_requests from anon, authenticated;
grant select on public.refund_requests to authenticated;

create or replace function public.request_refund(p_order_id text, p_reason text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row orders;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_refunded numeric;
  v_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Sign in to ask for a refund.' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Tell us what went wrong.' using errcode = '22023';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters.' using errcode = '22023';
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
    raise exception 'You already asked for a refund on this order. An admin will reply.'
      using errcode = 'P0001';
  end if;

  insert into refund_requests (order_id, customer_user_id, reason)
  values (p_order_id, auth.uid(), v_reason)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.request_refund(text, text) is
  'Customer asks for a refund on their own delivered, or paid-and-cancelled, order within 7 days; one open request per order (0159).';
revoke all on function public.request_refund(text, text) from public, anon;
grant execute on function public.request_refund(text, text) to authenticated;

create or replace function public.admin_resolve_refund_request(
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
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_refund_id bigint;
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  select * into v_req from refund_requests q where q.id = p_request_id for update;
  if not found then
    raise exception 'Refund request not found.' using errcode = 'P0001';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request was already %.', v_req.status using errcode = 'P0001';
  end if;

  if p_approve then
    -- Checks the amount, the method and the order-total cap, and writes the ledger.
    select r.id into v_refund_id
      from public.admin_record_refund(
        v_req.order_id, p_amount, p_method, coalesce(v_note, v_req.reason)) r;
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
                             'amount', case when p_approve then round(p_amount, 2) end,
                             'method', case when p_approve then p_method end,
                             'note', v_note),
          auth.uid());

  -- The new order_refunds id on approval, so the caller can tell the customer.
  return v_refund_id;
end;
$$;

comment on function public.admin_resolve_refund_request(bigint, boolean, numeric, text, text) is
  'Admin approves a refund request (recording the refund via admin_record_refund) or declines it with a note (0159).';
revoke all on function public.admin_resolve_refund_request(bigint, boolean, numeric, text, text)
  from public, anon;
grant execute on function public.admin_resolve_refund_request(bigint, boolean, numeric, text, text)
  to authenticated;
