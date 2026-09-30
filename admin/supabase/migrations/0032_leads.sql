-- --------------------------------------------------------------------------
-- Launch leads: waitlist + restaurant and rider applications
--
-- One table for the three pre-launch forms. They collect the same fields
-- (name, a way to reach the person, an optional note) and differ only in which
-- queue they land in, so separate tables would be three copies of one shape.
--
-- Security posture, deliberately identical to the rest of the write path:
--
--   * RLS is enabled with NO policies, and the table privileges are revoked
--     from anon and authenticated. A customer-facing browser cannot select,
--     insert, update or delete a single row -- there is no public read.
--   * The only writer is submit_lead(), a SECURITY DEFINER function that runs
--     as the owner, validates the input and inserts. It is granted to anon
--     because the forms are reachable signed-out, which is the whole point of a
--     pre-launch waitlist.
--   * contact is stored as typed. No public read exists to leak it.
-- --------------------------------------------------------------------------

create table if not exists leads (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('waitlist', 'restaurant', 'rider')),
  name text not null,
  contact text not null,
  note text,
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table leads is
  'Pre-launch signups: customer waitlist, restaurant applications and rider applications. No public read; inserts go through submit_lead().';

-- One signup per contact per queue. Re-submitting silently keeps the first row.
create unique index if not exists leads_kind_contact_key
  on leads (kind, lower(contact));

alter table leads enable row level security;

-- Belt and braces: RLS already blocks this without policies, but the grants are
-- revoked so the intent survives a future careless "grant all".
revoke all on table leads from anon;
revoke all on table leads from authenticated;
grant all on table leads to service_role;

create or replace function public.submit_lead(
  p_kind text,
  p_name text,
  p_contact text,
  p_note text default null,
  p_consent boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_contact text := btrim(coalesce(p_contact, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_kind not in ('waitlist', 'restaurant', 'rider') then
    raise exception 'Unknown signup type.' using errcode = '22023';
  end if;

  if not p_consent then
    raise exception 'Consent is required.' using errcode = '22023';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'Enter a name (up to 120 characters).' using errcode = '22023';
  end if;

  if char_length(v_contact) < 3 or char_length(v_contact) > 200 then
    raise exception 'Enter a phone number or email.' using errcode = '22023';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Keep the note under 500 characters.' using errcode = '22023';
  end if;

  insert into leads (kind, name, contact, note)
  values (p_kind, v_name, v_contact, v_note)
  on conflict (kind, lower(contact)) do nothing;
end;
$$;

comment on function public.submit_lead(text, text, text, text, boolean)
  is 'Insert a pre-launch signup (waitlist/restaurant/rider). Validates and de-dupes; the only writer of leads.';

revoke all on function public.submit_lead(text, text, text, text, boolean) from public;
grant execute on function public.submit_lead(text, text, text, text, boolean)
  to anon, authenticated;
