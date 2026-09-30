-- --------------------------------------------------------------------------
-- Add the 'customer' role to app_role.
--
-- Deliberately its own migration with nothing else in it, mirroring 0017:
-- PostgreSQL forbids using a newly-added enum value in the same transaction
-- that added it, and migrate-db.yml validates each file inside one
-- BEGIN...ROLLBACK. Anything that reads role = 'customer' -- the storefront
-- RLS, register_customer(), customer_place_order() -- must land in a later
-- migration (0021+).
-- --------------------------------------------------------------------------

do $$ begin
  alter type public.app_role add value 'customer';
exception when duplicate_object then null;
end $$;