-- --------------------------------------------------------------------------
-- Customer self-service registration (register_customer)
--
-- The storefront accepts accounts created at the door: Google, Facebook,
-- Apple, or email/password sign-up. The auth side (creating the account) is a
-- Supabase Auth operation, done from the app. This function is the one
-- stepping stone between "auth account" and "customer": it writes the
-- app_users row that turns a session into the customer role the mobile app
-- routes on.
--
-- Why a function, and why this shape:
--
--   * app_users is deliberately read-only over PostgREST (0011). The role row
--     has to come from a SECURITY DEFINER function, and this is the only one a
--     customer can reach -- the provisioning ones in 0011/0018 re-check
--     is_platform_admin() and refuse anyone else.
--   * It is idempotent. The sign-in flow calls it after every first role
--     resolution fails, on every device, and it must not double-write or
--     clobber. Once an account has ANY app_users row -- including a later
--     upgrade to merchant/rider/admin by an admin -- it stops touching it.
--     "Never confidently rewrite a row that already has a role" is the
--     inverse of the 0011 guard (never silently demote an admin): the two
--     together mean only an empty slot becomes a customer, and nothing else
--     ever changes.
--   * auth.uid() is the only identity accepted. There is no email/user
--     parameter to point at someone else's account.
--
-- Self-service registration is scoped to the PUBLIC sign-in path the customer
-- app uses, so anon keeps no grant: this is about the customer's own row, and
-- the caller must already hold a session.
-- --------------------------------------------------------------------------

create or replace function public.register_customer()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to create your customer account.'
      using errcode = '42501';
  end if;

  -- Never touch a provisioned account. Whatever role this account already
  -- has (including a NULL-role placeholder, which is not a thing the schema
  -- allows) stays. The insert below is the only code path that writes.
  if exists (
    select 1 from app_users where user_id = auth.uid()
  ) then
    return;
  end if;

  insert into app_users (user_id, role)
  values (auth.uid(), 'customer');
end;
$$;

comment on function public.register_customer()
  is 'Insert an app_users row making the current signed-in user a customer. Idempotent: no-op when the account already has any role.';

revoke all on function public.register_customer() from public;
revoke all on function public.register_customer() from anon;
grant execute on function public.register_customer() to authenticated;