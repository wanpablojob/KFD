-- --------------------------------------------------------------------------
-- Menu item photos
--
-- 0056 added menu_items.image_url and the customer app renders it, but nothing
-- could set it: there was no bucket and no upload path, so every menu was
-- text-only. This adds a bucket the merchant app uploads into.
--
-- PUBLIC on purpose. A menu photo is shown to every customer, signed in or
-- not, so it is served by its public URL with no read policy. That is the
-- opposite of delivery-proofs (0079), which is private evidence.
--
-- Writes are scoped by path, like delivery-proofs: the first folder is the
-- restaurant id, so a merchant can add or remove photos only under their own
-- restaurant, and an admin under any. File names are unique per upload, so no
-- overwrite (UPDATE) policy is needed.
-- --------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "merchants upload own menu images" on storage.objects;
create policy "merchants upload own menu images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'menu-images'
    and (
      public.is_platform_admin()
      or (storage.foldername(name))[1] = public.current_merchant_restaurant()
    )
  );

drop policy if exists "merchants delete own menu images" on storage.objects;
create policy "merchants delete own menu images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'menu-images'
    and (
      public.is_platform_admin()
      or (storage.foldername(name))[1] = public.current_merchant_restaurant()
    )
  );
