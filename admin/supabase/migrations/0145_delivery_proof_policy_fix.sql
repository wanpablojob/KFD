-- --------------------------------------------------------------------------
-- 0145: a rider's delivery photo can actually be uploaded
--
-- 0079's storage policies compared the rider id against
-- (storage.foldername(name))[1]. The subquery aliases public.riders as `r`,
-- and riders has a column called `name`, so inside that subquery `name`
-- resolved to r.name -- the rider's display name -- instead of
-- storage.objects.name, the object path. The deparsed policy reads
-- `storage.foldername(r.name)`, which proves the binding.
--
-- foldername('Juan Dela Cruz') is an empty array, so [1] is null and
-- r.id = null is never true. The WITH CHECK could not pass for any rider, so
-- every delivery-proof upload was refused with an RLS violation. The rider
-- half of the read policy had the same defect.
--
-- Consequence: no delivery could be completed. The app uploads the photo
-- first and only then calls rider_mark_delivered with its path (0079 made the
-- RPC refuse a path that is not in the bucket), so the RPC was never reached
-- and the order stayed open. The bucket is empty in production, which is the
-- same fact seen from the other side.
--
-- Fix: qualify the column, so the inner `r` alias can no longer capture it.
-- Both policies are rebuilt from their live definitions with only the
-- qualifier changed; no rule moves.
-- --------------------------------------------------------------------------

drop policy if exists "riders upload own delivery proof" on storage.objects;
create policy "riders upload own delivery proof"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'delivery-proofs'
    and exists (
      select 1 from public.riders r
       where r.user_id = auth.uid()
         and r.archived_at is null
         and r.suspended_at is null
         -- `objects` is the row being written. Qualifying it is the fix:
         -- an unqualified `name` here binds to r.name, not the object path.
         and r.id = (storage.foldername(objects.name))[1]
    )
  );

drop policy if exists "read delivery proof" on storage.objects;
create policy "read delivery proof"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'delivery-proofs'
    and (
      exists (
        select 1 from public.riders r
         where r.user_id = auth.uid()
           and r.id = (storage.foldername(objects.name))[1]
      )
      or exists (
        select 1 from public.app_users a
         where a.user_id = auth.uid()
           and a.role = 'admin'
      )
    )
  );
