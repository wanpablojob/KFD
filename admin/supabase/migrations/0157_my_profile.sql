-- --------------------------------------------------------------------------
-- 0157: customers and riders set their own name and profile photo
--
-- The name lives where everything already reads it: the login's metadata
-- `name`, which order, trip and pabakal placement copy onto each order, and
-- the customers / riders row. A Google sign-in rewrites `name` from the Google
-- profile every time, so the chosen name is also kept as `display_name`, and a
-- trigger puts it back over `name` whenever the login row changes. That keeps
-- every existing reader of `name` working without rebuilding them.
--
-- The photo goes in a public `avatars` bucket under the person's own login id
-- (folder = auth.uid()), and its URL in metadata `photo_url`, a key Google
-- does not touch. Same shape as the GCash QR bucket (0091).
-- --------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "users upload own avatar" on storage.objects;
create policy "users upload own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users delete own avatar" on storage.objects;
create policy "users delete own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.update_my_profile(p_name text, p_photo_url text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_photo text := nullif(btrim(coalesce(p_photo_url, '')), '');
begin
  if v_uid is null then
    raise exception 'Sign in to edit your profile.' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'Your name must be 2 to 60 characters.' using errcode = '22023';
  end if;
  -- Only a photo from this person's own folder in the avatars bucket.
  if v_photo is not null
     and position('/storage/v1/object/public/avatars/' || v_uid::text || '/' in v_photo) = 0 then
    raise exception 'That photo is not one you uploaded.' using errcode = '22023';
  end if;

  update auth.users
     set raw_user_meta_data = case
           when v_photo is null then coalesce(raw_user_meta_data, '{}'::jsonb) - 'photo_url'
           else coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('photo_url', v_photo)
         end || jsonb_build_object('display_name', v_name, 'name', v_name)
   where id = v_uid;

  update customers set name = v_name where user_id = v_uid;
  update riders set name = v_name where user_id = v_uid;
end;
$$;

comment on function public.update_my_profile(text, text) is
  'The caller sets their own name (2-60 characters) and profile photo (from their own avatars folder, or null to remove) (0157).';
revoke all on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;

-- A provider sign-in rewrites metadata `name`; put the chosen one back.
create or replace function public.keep_display_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_user_meta_data ? 'display_name'
     and new.raw_user_meta_data ->> 'name' is distinct from new.raw_user_meta_data ->> 'display_name' then
    new.raw_user_meta_data := new.raw_user_meta_data
      || jsonb_build_object('name', new.raw_user_meta_data ->> 'display_name');
  end if;
  return new;
end;
$$;

revoke all on function public.keep_display_name() from public, anon, authenticated;

drop trigger if exists keep_display_name on auth.users;
create trigger keep_display_name before update of raw_user_meta_data on auth.users
  for each row execute function public.keep_display_name();
