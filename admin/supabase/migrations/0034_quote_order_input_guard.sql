-- --------------------------------------------------------------------------
-- quote_order: match 0023's empty-cart guard
-- --------------------------------------------------------------------------
-- 0033's quote_order checked `jsonb_array_length(p_items) = 0` but not that
-- p_items was an array at all, unlike 0023. A caller sending
-- {"menu_item_id":"x","quantity":1} got Postgres' "cannot get array length of a
-- non-array" -- a raw internal message that says nothing about the cart, and
-- would be shown to a customer by the checkout screen.
--
-- Verified against production before writing this: a single JSON object as
-- p_items returned that error. 0023's guard turns it into 'Your cart is empty.',
-- which is both true and actionable.
--
-- Redefined rather than editing 0033, which is already applied. This is the
-- same approach 0030/0033 took for fetch_rider_orders_page.
--
create or replace function public.quote_order(
  p_restaurant_id text,
  p_items jsonb
)
returns table (
  subtotal numeric,
  delivery_fee numeric,
  service_fee numeric,
  total numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item record;
  v_qty int;
  v_menu_id text;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_delivery_fee numeric;
  v_service_fee numeric;
  v_matches int := 0;
begin
  select f.delivery_fee, f.service_fee
    into v_delivery_fee, v_service_fee
    from public.order_fees() f;

  -- Anon may preview a cart before deciding to sign in; placing the order
  -- still requires auth via customer_place_order.
  if p_restaurant_id is null or btrim(p_restaurant_id) = '' then
    raise exception 'Pick a restaurant first.' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from restaurants r
     where r.id = p_restaurant_id
       and r.status = 'active'
       and r.archived_at is null
  ) then
    raise exception 'That restaurant is not available right now.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_menu_id := v_item.value ->> 'menu_item_id';
    v_qty := coalesce((v_item.value ->> 'quantity')::int, 0);

    if v_qty <= 0 then
      raise exception 'Quantities must be at least 1.' using errcode = '22023';
    end if;

    select count(*) into v_matches
      from menu_items m
     where m.id = v_menu_id
       and m.restaurant_id = p_restaurant_id
       and m.available = true;

    if v_matches = 0 then
      raise exception 'One or more items are no longer available.' using errcode = '22023';
    end if;

    select (m.price * v_qty) into v_line_total
      from menu_items m where m.id = v_menu_id;

    v_subtotal := v_subtotal + v_line_total;
  end loop;

  return query
    select v_subtotal, v_delivery_fee, v_service_fee,
           v_subtotal + v_delivery_fee + v_service_fee;
end;
$$;

comment on function public.quote_order(text, jsonb)
  is 'Server-authoritative price preview for a cart. Mirrors the pricing and availability checks in customer_place_order so the preview and the charge cannot disagree. Callable by anon.';

revoke all on function public.quote_order(text, jsonb) from public;
grant execute on function public.quote_order(text, jsonb) to anon, authenticated;
