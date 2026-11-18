-- --------------------------------------------------------------------------
-- 0153: Merchant access lists merchants (and admins), not every account
--
-- merchant_access_list() was written in 0011, when app_users held only admins
-- and merchants. Riders (0017) and customers (0020) joined the same table, and
-- the function kept returning every row, so the Merchant access page showed
-- riders and customers as "Merchant" -- with a Reassign button that would make
-- them one. Rebuilt from 0011 with only the role filter added.
-- --------------------------------------------------------------------------

create or replace function public.merchant_access_list()
returns table (
  user_id uuid,
  email text,
  role app_role,
  restaurant_id text,
  restaurant_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.user_id,
    coalesce(u.email, '(no email)') as email,
    a.role,
    a.restaurant_id,
    r.name as restaurant_name,
    a.created_at
  from app_users a
  left join auth.users u on u.id = a.user_id
  left join restaurants r on r.id = a.restaurant_id
  where public.is_platform_admin()
    and a.role in ('admin', 'merchant')
  order by a.role asc, coalesce(u.email, '') asc;
$$;
