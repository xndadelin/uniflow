-- Supabase Storage policies for bucket: course-materials
-- Path convention used by the app:
--   course-<course_id>/<anything>
--
-- NOTE:
-- In some Supabase projects, running these from SQL Editor can fail with:
--   ERROR: 42501: must be owner of table objects
-- If that happens, apply the exact USING/WITH CHECK expressions via:
--   Dashboard → Storage → Policies (table: storage.objects)

-- 1) Bucket (optional; you said you'll create it manually as public)
-- insert into storage.buckets (id, name, public)
-- values ('course-materials', 'course-materials', true)
-- on conflict (id) do update
-- set public = excluded.public;

-- 2) READ: allow anyone to read objects in this bucket
drop policy if exists "course_materials_objects_read" on storage.objects;
create policy "course_materials_objects_read"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'course-materials'
);

-- 3) INSERT: only admin or course teacher can upload under course-<id>/
drop policy if exists "course_materials_objects_insert" on storage.objects;
create policy "course_materials_objects_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'course-materials'
  and (
    public.is_admin(auth.uid())
    or exists (
      select 1
      from public.courses c
      where c.teacher_id = auth.uid()
        and ('course-' || c.id::text || '/') = left(name, length('course-' || c.id::text || '/'))
    )
  )
);

-- 4) UPDATE: only admin or course teacher can update objects under course-<id>/
drop policy if exists "course_materials_objects_update" on storage.objects;
create policy "course_materials_objects_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'course-materials'
  and (
    public.is_admin(auth.uid())
    or exists (
      select 1
      from public.courses c
      where c.teacher_id = auth.uid()
        and ('course-' || c.id::text || '/') = left(name, length('course-' || c.id::text || '/'))
    )
  )
)
with check (
  bucket_id = 'course-materials'
  and (
    public.is_admin(auth.uid())
    or exists (
      select 1
      from public.courses c
      where c.teacher_id = auth.uid()
        and ('course-' || c.id::text || '/') = left(name, length('course-' || c.id::text || '/'))
    )
  )
);

-- 5) DELETE: only admin or course teacher can delete objects under course-<id>/
drop policy if exists "course_materials_objects_delete" on storage.objects;
create policy "course_materials_objects_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'course-materials'
  and (
    public.is_admin(auth.uid())
    or exists (
      select 1
      from public.courses c
      where c.teacher_id = auth.uid()
        and ('course-' || c.id::text || '/') = left(name, length('course-' || c.id::text || '/'))
    )
  )
);

