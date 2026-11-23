-- --------------------------------------------------------------------------
-- 0160: remember which installs have the Meriendash notification sound
--
-- Builds from this release ship their own sound (mobile/assets/sounds) on new
-- Android channels, because Android fixes a channel's sound when it is first
-- created. A push addressed to a channel the installed app never created is
-- dropped, so the server must keep sending the old channels to older installs
-- and the new ones only to installs that said they have them. The app says so
-- when it registers its token (api/push/register).
-- --------------------------------------------------------------------------

alter table public.push_tokens
  add column if not exists custom_sound boolean not null default false;

comment on column public.push_tokens.custom_sound is
  'True when the install ships the Meriendash sound and its sound channels (0160).';
