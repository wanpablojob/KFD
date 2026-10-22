-- --------------------------------------------------------------------------
-- Pabakal from several stores, with quantities instead of a budget
--
-- 0120 took one store, a free-text list and a budget. Customers buy from more
-- than one store in one errand (the pharmacy, then the hardware), and asking
-- them for a budget read as asking how much money they have. Now a pabakal is
-- a list of stops, each a store with item lines and quantities:
--
--   [{"store": "Mercury Drug", "items": [{"name": "Biogesic 500mg", "quantity": 10}]}]
--
-- The fee follows the food trips (0094): the pabakal fee plus 10 per extra
-- store. The rider is still protected without a budget: a receipt total over
-- max_cost is refused, so no rider fronts more than that on one pabakal.
--
-- store and items stay as readable summaries of the stops, so the 0120
-- screens and the admin list keep working unchanged. budget is kept for the
-- rows 0120 wrote and is null from now on.
-- --------------------------------------------------------------------------

alter table public.pabakal_requests
  add column if not exists stops jsonb not null default '[]'::jsonb,
  alter column budget drop not null,
  drop constraint if exists pabakal_requests_store_check,
  drop constraint if exists pabakal_requests_items_check,
  drop constraint if exists pabakal_requests_budget_check,
  add constraint pabakal_requests_budget_check check (budget is null or budget > 0);

comment on column public.pabakal_requests.stops is
  'The stores to buy from, in order, each with item lines and quantities (0130).';

drop function if exists public.pabakal_rules();
create function public.pabakal_rules()
returns table (
  pabakal_fee numeric,
  per_extra_store numeric,
  max_cost numeric,
  max_stores int,
  max_lines int
)
language sql
immutable
as $$ select 20.00::numeric, 10.00::numeric, 2000.00::numeric, 5, 30 $$;

comment on function public.pabakal_rules()
  is 'Pabakal fee, the fee per extra store, the most a rider fronts on one pabakal, and the size limits (0130).';
grant execute on function public.pabakal_rules() to authenticated;


drop function if exists public.customer_request_pabakal(text, text, numeric, text, text, text, text);
create function public.customer_request_pabakal(
  p_stops jsonb,
  p_delivery_address text,
  p_barangay text default null,
  p_contact_phone text default null,
  p_note text default null
)
returns table (id uuid, reference text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_phone text := nullif(btrim(coalesce(p_contact_phone, '')), '');
  v_address text := nullif(btrim(coalesce(p_delivery_address, '')), '');
  v_barangay text := nullif(btrim(coalesce(p_barangay, '')), '');
  v_delivery_fee numeric;
  v_agreed boolean;
  v_rules record;
  v_stop jsonb;
  v_line jsonb;
  v_store text;
  v_item text;
  v_qty int;
  v_lines int := 0;
  v_clean jsonb := '[]'::jsonb;
  v_items jsonb;
  v_stores text[] := '{}';
  v_summary text := '';
begin
  if auth.uid() is null
     or not exists (select 1 from app_users where user_id = auth.uid() and role = 'customer') then
    raise exception 'This action is for customers only.' using errcode = '42501';
  end if;
  if exists (
    select 1 from customers
     where user_id = auth.uid() and (blocked_at is not null or archived_at is not null)
  ) then
    raise exception 'Your account cannot place orders right now. Please contact support.'
      using errcode = '42501';
  end if;

  select * into v_rules from pabakal_rules();

  if p_stops is null or jsonb_typeof(p_stops) <> 'array' or jsonb_array_length(p_stops) = 0 then
    raise exception 'Add a store and what to buy there.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_stops) > v_rules.max_stores then
    raise exception 'A pabakal can visit up to % stores.', v_rules.max_stores using errcode = '22023';
  end if;

  -- Rebuilt from the input rather than stored as sent, so only store, name and
  -- quantity reach the table.
  for v_stop in select value from jsonb_array_elements(p_stops) loop
    v_store := btrim(coalesce(v_stop ->> 'store', ''));
    if length(v_store) < 2 or length(v_store) > 80 then
      raise exception 'Name each store (2 to 80 letters).' using errcode = '22023';
    end if;
    if jsonb_typeof(v_stop -> 'items') is distinct from 'array'
       or jsonb_array_length(v_stop -> 'items') = 0 then
      raise exception 'Add at least one item for %.', v_store using errcode = '22023';
    end if;
    v_items := '[]'::jsonb;
    v_summary := v_summary || case when v_summary = '' then '' else E'\n' end || v_store || ':';
    for v_line in select value from jsonb_array_elements(v_stop -> 'items') loop
      v_item := btrim(coalesce(v_line ->> 'name', ''));
      v_qty := case when (v_line ->> 'quantity') ~ '^\d{1,3}$' then (v_line ->> 'quantity')::int end;
      if length(v_item) < 1 or length(v_item) > 100 then
        raise exception 'Name each item at %.', v_store using errcode = '22023';
      end if;
      if v_qty is null or v_qty < 1 or v_qty > 99 then
        raise exception 'Give a quantity from 1 to 99 for %.', v_item using errcode = '22023';
      end if;
      v_lines := v_lines + 1;
      v_items := v_items || jsonb_build_object('name', v_item, 'quantity', v_qty);
      v_summary := v_summary || E'\n' || v_qty || '× ' || v_item;
    end loop;
    v_clean := v_clean || jsonb_build_object('store', v_store, 'items', v_items);
    v_stores := v_stores || v_store;
  end loop;
  if v_lines > v_rules.max_lines then
    raise exception 'That is too many items for one pabakal (up to %).', v_rules.max_lines
      using errcode = '22023';
  end if;
  if length(coalesce(p_note, '')) > 300 then
    raise exception 'Keep the note under 300 letters.' using errcode = '22023';
  end if;

  if v_address is null or length(v_address) < 8 then
    raise exception 'Enter your full delivery address.' using errcode = '22023';
  end if;

  -- Same service area and price rule as a food order (0080, 0084).
  select f.delivery_fee, f.fee_agreed_in_person into v_delivery_fee, v_agreed
    from order_fees(v_barangay) f;
  if exists (select 1 from service_areas) then
    if v_barangay is null then
      raise exception 'Choose your barangay.' using errcode = '22023';
    end if;
    if not exists (select 1 from service_areas sa where lower(sa.barangay) = lower(v_barangay))
       or (v_delivery_fee is null and not v_agreed) then
      raise exception 'We do not deliver to % yet.', v_barangay using errcode = '22023';
    end if;
  end if;

  select coalesce(nullif(btrim(raw_user_meta_data ->> 'name'), ''),
                  nullif(split_part(email, '@', 1), ''), 'Customer'),
         coalesce(v_phone, nullif(btrim(raw_user_meta_data ->> 'phone'), ''))
    into v_name, v_phone
    from auth.users where auth.users.id = auth.uid();

  if v_phone is null
     or length(regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 7 and 15
     or v_phone ~ '[^0-9+()\-[:space:]]' then
    raise exception 'Enter a valid contact number, e.g. 0917 123 4567.' using errcode = '22023';
  end if;

  if (select count(*) from pabakal_requests r
       where r.customer_user_id = auth.uid()
         and r.status in ('open', 'accepted', 'delivering')) >= 2 then
    raise exception 'You already have 2 pabakal on the way. Wait for one to arrive first.'
      using errcode = '22023';
  end if;

  return query
    insert into pabakal_requests as r
      (customer_user_id, customer_name, contact_phone, delivery_address, barangay,
       stops, store, items, note, delivery_fee, pabakal_fee)
    values
      (auth.uid(), v_name, v_phone, v_address, v_barangay,
       v_clean, array_to_string(v_stores, ', '), v_summary,
       nullif(btrim(coalesce(p_note, '')), ''),
       coalesce(v_delivery_fee, 0),
       v_rules.pabakal_fee + v_rules.per_extra_store * (array_length(v_stores, 1) - 1))
    returning r.id, r.reference;
end;
$$;


drop function if exists public.rider_open_pabakal();
create function public.rider_open_pabakal()
returns table (
  id uuid, reference text, store text, items text, stops jsonb, note text,
  barangay text, delivery_fee numeric, pabakal_fee numeric, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_rider_id() is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;
  return query
    select r.id, r.reference, r.store, r.items, r.stops, r.note,
           r.barangay, r.delivery_fee, r.pabakal_fee, r.created_at
      from pabakal_requests r
     where r.status = 'open'
     order by r.created_at;
end;
$$;


create or replace function public.rider_pabakal_bought(p_id uuid, p_item_cost numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_budget numeric;
  v_max numeric := (select max_cost from pabakal_rules());
begin
  select budget into v_budget from pabakal_requests
   where id = p_id and rider_id = public.current_rider_id() and status = 'accepted'
   for update;
  if not found then
    raise exception 'That pabakal is not yours to update.' using errcode = '42501';
  end if;
  if p_item_cost is null or p_item_cost <= 0 then
    raise exception 'Enter the receipt total.' using errcode = '22023';
  end if;
  -- A 0120 row still has the budget the customer agreed to; every row has the
  -- platform cap that keeps a rider from fronting more than they can carry.
  if p_item_cost > least(coalesce(v_budget, v_max), v_max) then
    raise exception 'That is over the ₱% a rider can front. Call the customer and KFD before buying more.',
      to_char(least(coalesce(v_budget, v_max), v_max), 'FM999990.00') using errcode = '22023';
  end if;
  update pabakal_requests
     set status = 'delivering', item_cost = round(p_item_cost, 2), bought_at = now()
   where id = p_id;
end;
$$;

revoke all on function public.customer_request_pabakal(jsonb, text, text, text, text) from public, anon;
grant execute on function public.customer_request_pabakal(jsonb, text, text, text, text) to authenticated;
revoke all on function public.rider_open_pabakal() from public, anon;
grant execute on function public.rider_open_pabakal() to authenticated;
