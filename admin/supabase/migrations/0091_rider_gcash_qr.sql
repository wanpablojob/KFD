-- --------------------------------------------------------------------------
-- Rider GCash QR images
--
-- 0057 gave riders gcash_qr_url and a form that asked for a link. A rider's QR
-- lives inside the GCash app as a screenshot, not on a website, so in practice
-- the field stayed empty and the customer's "Pay by GCash" block never showed.
-- This adds a bucket the rider app can upload that screenshot into; the
-- existing gcash_qr_url then holds the object's public URL.
--
-- PUBLIC on purpose, like menu-images (0086): the QR is a payment handle the
-- rider wants customers to scan, not evidence. order_rider_payment (0057) is
-- still the only way the customer app learns the URL, and it returns it only to
-- the order's own signed-in customer. Public reads are by URL only; the object
-- name includes the rider id and a random suffix, and the bucket does not list.
--
-- Writes are scoped by path, like delivery-proofs (0079): the first folder is
-- the rider id, so a rider can write or remove only under their own folder.
-- Every upload gets a fresh name, so a replacement never needs UPDATE.
-- --------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gcash-qr', 'gcash-qr', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- No COMMENT ON: a bucket is not a commentable object type (see 0079). The
-- purpose is documented above instead.

-- A security-definer helper rather than an EXISTS subquery on riders. Storage
-- evaluates the policy with a role that cannot read the rider's row, so the
-- same EXISTS predicate that works in an RPC sees nothing here (the throwaway
-- SQL tests catch exactly this). The helper runs as its definer, returns only
-- the caller's own active rider id, and leaves the policy as one comparison.
create or replace function public.current_active_rider_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.id
    from riders r
   where r.user_id = auth.uid()
     and r.archived_at is null
     and r.suspended_at is null
   limit 1;
$$;

comment on function public.current_active_rider_id() is
  'The calling rider''s id when the account is active; null for anyone else. Used by storage policies (0091).';

revoke all on function public.current_active_rider_id() from public, anon;
grant execute on function public.current_active_rider_id() to authenticated;

drop policy if exists "riders upload own gcash qr" on storage.objects;
create policy "riders upload own gcash qr"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'gcash-qr'
    and (storage.foldername(name))[1] = public.current_active_rider_id()
  );

-- A rider replacing their QR uploads a new object, but removal still needs a
-- delete path so a rider can clear the image from their profile.
drop policy if exists "riders delete own gcash qr" on storage.objects;
create policy "riders delete own gcash qr"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'gcash-qr'
    and (storage.foldername(name))[1] = public.current_active_rider_id()
  );

-- No update policy: every upload gets a fresh name, so there is nothing to
-- overwrite and no way for a stale path to point at a different rider's image.
