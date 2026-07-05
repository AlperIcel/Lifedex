-- LifeDex — public Storage bucket for card images.
-- Run once in the Supabase SQL editor. Creates the bucket + RLS on storage.objects
-- so anyone can READ card images but a user can only write into their OWN folder
-- (path = {auth.uid()}/{sightingId}.jpg). Card images are AI/cropped recreations —
-- never the original photo.

insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', true)
on conflict (id) do nothing;

-- Public read (bucket is public content).
drop policy if exists "card images public read" on storage.objects;
create policy "card images public read"
  on storage.objects for select
  using ( bucket_id = 'card-images' );

-- Insert only into your own {uid}/ folder.
drop policy if exists "card images insert own" on storage.objects;
create policy "card images insert own"
  on storage.objects for insert
  with check (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update / delete only your own.
drop policy if exists "card images update own" on storage.objects;
create policy "card images update own"
  on storage.objects for update
  using (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "card images delete own" on storage.objects;
create policy "card images delete own"
  on storage.objects for delete
  using (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
