-- --------------------------------------------------------------------------
-- Add the 'rider' role to app_role.
--
-- Deliberately its own migration with nothing else in it: PostgreSQL forbids
-- using a newly-added enum value in the same transaction that added it
-- ("unsafe use of new value of enum type"), and migrate-db.yml validates each
-- file inside one BEGIN...ROLLBACK. Anything that reads role = 'rider' must
-- land in a later migration (0018).
-- --------------------------------------------------------------------------

do $$ begin
  alter type public.app_role add value 'rider';
exception when duplicate_object then null;
end $$;