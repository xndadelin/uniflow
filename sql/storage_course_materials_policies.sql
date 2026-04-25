

drop policy if exists "course_materials_objects_read" on storage.objects;
create policy "course_materials_objects_read"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'course-materials'
);


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
        and (
          ('course-' || c.id::text || '/') = left(name, length('course-' || c.id::text || '/'))
          or ('homework/course-' || c.id::text || '/') = left(name, length('homework/course-' || c.id::text || '/'))
        )
    )
    or exists (
      select 1
      from public.courses c
      where public.is_enrolled_in_course(c.id, auth.uid())
        and ('homework/course-' || c.id::text || '/') = left(name, length('homework/course-' || c.id::text || '/'))
    )
  )
);


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
        and (
          ('course-' || c.id::text || '/') = left(name, length('course-' || c.id::text || '/'))
          or ('homework/course-' || c.id::text || '/') = left(name, length('homework/course-' || c.id::text || '/'))
        )
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
        and (
          ('course-' || c.id::text || '/') = left(name, length('course-' || c.id::text || '/'))
          or ('homework/course-' || c.id::text || '/') = left(name, length('homework/course-' || c.id::text || '/'))
        )
    )
  )
);


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
        and (
          ('course-' || c.id::text || '/') = left(name, length('course-' || c.id::text || '/'))
          or ('homework/course-' || c.id::text || '/') = left(name, length('homework/course-' || c.id::text || '/'))
        )
    )
  )
);
