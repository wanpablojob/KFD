-- Restore rdr_01's address to the account it actually logs in with.
--
-- 0049 moved every seeded rider fixture off @kfd.ph onto example.com, because
-- kfd.ph has no MX record and anything mailed to it bounces. That was right,
-- and it deliberately included rdr_01 on the grounds that riders.email is
-- display-only and nothing reads it as a key. That claim is true and still is:
-- nothing joins on riders.email, riders link to auth by user_id.
--
-- But rdr_01 is not a synthetic row. It is the row behind the live demo
-- sign-in rider@kfd.com, and 0049 left the console in this state:
--
--     riders list (riders.email)   juan.delacruz@example.com
--     Supabase Auth (auth.users)    rider@kfd.com
--
-- set_rider_access() matches auth.users by the address it is *handed*, so an
-- admin working from the riders page types what the page showed and gets
--
--     No account exists for juan.delacruz@example.com. Create the account in
--     Supabase Auth first.
--
-- for the one rider that demonstrably has an account. Confirmed by calling it
-- against a real Postgres engine rather than inferred from the schema.
--
-- ---------------------------------------------------------------------------
-- Why this is an explicit pairing and not a rule
-- ---------------------------------------------------------------------------
-- The obvious general fix -- "for every rider with a linked account, set
-- riders.email to the auth address" -- is wrong here, and was wrong in the
-- first draft of this file. It only reaches riders that are already linked,
-- which is exactly backwards: the rider an admin cannot link is the one whose
-- displayed address is unusable. Matching unlinked riders to accounts has to
-- go through name or phone, which is guesswork against auth metadata an admin
-- cannot even read.
--
-- So the demo pairing is stated outright rather than derived.
--
-- Left deliberately unfixed: the same drift returns for any future attach,
-- because set_rider_access() only writes user_id. Closing that means syncing
-- riders.email inside set_rider_access() at link time, which would overwrite
-- every rider's contact address with their auth address -- correct for the demo,
-- but a policy decision about real riders' contact details, not a bug fix. Not
-- silently changing that here.
--
-- Forward-only, like every correction in this repo: 0001 and 0049 are immutable
-- history, and a database rebuilt from scratch reaches this file from 0049.

update public.riders
   set email = 'rider@kfd.com'
 where id = 'rdr_01'
   -- Only if the account is real. Otherwise this would write an address with
   -- no auth user behind it, trading one broken state for another.
   and exists (
     select 1
       from auth.users u
      where lower(u.email) = 'rider@kfd.com'
   )
   -- Guards UNIQUE(riders.email): if some other rider already carries this
   -- address, taking it would abort the migration and leave everything else
   -- unfixed.
   and not exists (
     select 1
       from public.riders dup
      where dup.email = 'rider@kfd.com'
        and dup.id <> 'rdr_01'
   );

comment on column public.riders.email is
  'The rider''s email address, and for a rider with a live account it should be the address they sign in with -- the console matches auth by the address an admin types, so a display value that differs makes the rider unattachable (see 0074). Never a lookup key: riders link to auth by user_id. Unlinked fixtures keep an example.com address, which cannot receive mail and therefore cannot bounce (0049).';

-- ---------------------------------------------------------------------------
-- Report, because a silent 0-row update is indistinguishable from "already
-- correct" and this file exists precisely because a silent no-op looked like a
-- fix.
-- ---------------------------------------------------------------------------
do $$
declare
  v_account_exists boolean;
  v_email          text;
begin
  select exists (select 1 from auth.users where lower(email) = 'rider@kfd.com')
    into v_account_exists;

  select email into v_email from public.riders where id = 'rdr_01';

  raise notice 'rdr_01 riders.email is now %; rider@kfd.com exists in auth: %',
    v_email, v_account_exists;
end;
$$;