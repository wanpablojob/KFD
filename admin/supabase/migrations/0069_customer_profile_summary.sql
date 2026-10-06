-- --------------------------------------------------------------------------
-- Customer detail: profile summary, and admin-only writes
--
-- Everything an operator does to a customer goes through a function that checks
-- is_platform_admin() inside, mirroring 0011's close-the-direct-write-path
-- decision on app_users. That is deliberate: `customers` still carries 0001's
-- "authenticated full access" policy, so a policy-driven write rule would be
-- wider than intended, and a definer function is the pattern already used for
-- every other privileged write in this schema.
--
-- The summary is aggregated in SQL rather than in the browser because the order
-- history is paginated: the browser only holds one page, so a status or payment
-- mix computed from it would be wrong for every customer with more than 25
-- orders -- quietly, and only for the busiest ones.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- Profile summary: status mix, payment mix, where this person gets delivered
-- --------------------------------------------------------------------------
create or replace function public.admin_customer_summary(p_customer_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  if p_customer_user_id is null then
    raise exception 'A linked customer is required.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'statusCounts', coalesce((
      select jsonb_object_agg(s.status, s.n)
        from (
          select o.status, count(*) as n
            from orders o
           where o.customer_user_id = p_customer_user_id
           group by o.status
        ) s
    ), '{}'::jsonb),

    -- Payment mix over ALL orders, including cancelled ones: it answers "how
    -- does this person pay", which is a property of their habits, not of
    -- whether a given order completed.
    'paymentCounts', coalesce((
      select jsonb_object_agg(p.payment, p.n)
        from (
          select o.payment, count(*) as n
            from orders o
           where o.customer_user_id = p_customer_user_id
           group by o.payment
        ) p
    ), '{}'::jsonb),

    -- Where this person gets delivered, from orders.delivery_address rather than
    -- from a saved-addresses table, because that is the only place an address
    -- has ever been recorded (the customer types it free text at checkout).
    'recentAddresses', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'address', a.address,
                 'times', a.times,
                 'lastUsed', a.last_used
               )
               order by a.last_used desc
             )
        from (
          select nullif(btrim(o.delivery_address), '') as address,
                 count(*) as times,
                 max(o.placed_at) as last_used
            from orders o
           where o.customer_user_id = p_customer_user_id
             and nullif(btrim(o.delivery_address), '') is not null
           group by nullif(btrim(o.delivery_address), '')
        ) a
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.admin_customer_summary(uuid)
  is 'Order status mix, payment mix and most-recently-used delivery addresses for one linked customer, aggregated in SQL over ALL their orders. Admin-only (checked inside).';

revoke all on function public.admin_customer_summary(uuid) from public;
revoke all on function public.admin_customer_summary(uuid) from anon;
grant execute on function public.admin_customer_summary(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- Edit contact details and the operator note
--
-- email is NOT editable here and that is the point: customers.email is the
-- account identity used by /api/orders/notify to find this customer's address,
-- and auth.users.email is a second copy of it that this function cannot reach.
-- Editing one without the other would silently stop order emails reaching them,
-- so the field is read-only in the UI and changing an address is an auth
-- operation, not a customer-record one.
-- --------------------------------------------------------------------------
create or replace function public.admin_customer_update_contact(
  p_customer_id text,
  p_name text,
  p_phone text,
  p_city text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_city text := btrim(coalesce(p_city, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'A customer needs a name.' using errcode = 'P0001';
  end if;
  if v_city = '' then
    raise exception 'A customer needs a city.' using errcode = 'P0001';
  end if;
  if length(v_name) > 200 or length(v_city) > 200 then
    raise exception 'That name or city is too long.' using errcode = 'P0001';
  end if;
  if v_phone is not null and length(v_phone) > 40 then
    raise exception 'That phone number is too long.' using errcode = 'P0001';
  end if;
  if v_notes is not null and length(v_notes) > 2000 then
    raise exception 'That note is too long.' using errcode = 'P0001';
  end if;

  update customers
     set name = v_name,
         phone = v_phone,
         city = v_city,
         notes = v_notes
   where id = p_customer_id;

  if not found then
    raise exception 'Customer not found.' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.admin_customer_update_contact(text, text, text, text, text)
  is 'Admin edits a customer''s name, customer-record phone, city and operator note. email is deliberately not editable here: it is the auth identity /api/orders/notify resolves.';

revoke all on function public.admin_customer_update_contact(text, text, text, text, text) from public;
revoke all on function public.admin_customer_update_contact(text, text, text, text, text) from anon;
grant execute on function public.admin_customer_update_contact(text, text, text, text, text) to authenticated;

-- --------------------------------------------------------------------------
-- Block / unblock
--
-- Blocking is what stops an order being placed: customer_place_order (0067)
-- refuses a blocked account before pricing anything. Archiving is separate and
-- only a data-hygiene flag (0010 reasoning) -- it does not by itself block, but
-- customer_place_order refuses an archived row too, because an archived row is
-- not a customer who should be transacting.
-- --------------------------------------------------------------------------
create or replace function public.admin_customer_set_blocked(
  p_customer_id text,
  p_blocked boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  update customers
     set blocked_at = case when p_blocked then now() else null end
   where id = p_customer_id;

  if not found then
    raise exception 'Customer not found.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_customer_set_archived(
  p_customer_id text,
  p_archived boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  update customers
     set archived_at = case when p_archived then now() else null end
   where id = p_customer_id;

  if not found then
    raise exception 'Customer not found.' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.admin_customer_set_blocked(text, boolean)
  is 'Block or unblock a customer. A blocked account is refused by customer_place_order (0067). Admin-only (checked inside).';

comment on function public.admin_customer_set_archived(text, boolean)
  is 'Archive or restore a customer record (0010 reasoning). Admin-only (checked inside).';

revoke all on function public.admin_customer_set_blocked(text, boolean) from public;
revoke all on function public.admin_customer_set_blocked(text, boolean) from anon;
grant execute on function public.admin_customer_set_blocked(text, boolean) to authenticated;

revoke all on function public.admin_customer_set_archived(text, boolean) from public;
revoke all on function public.admin_customer_set_archived(text, boolean) from anon;
grant execute on function public.admin_customer_set_archived(text, boolean) to authenticated;