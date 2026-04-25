-- UniFlow auth domain schema for Supabase Postgres
-- Uses Supabase auth.users as source of truth for credentials.
-- This schema keeps app-level users and roles in separate tables.

-- 1) Roles catalog (separate from users)
create table if not exists public.roles (
  id bigserial primary key,
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

-- 2) App users table (separate from roles)
create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) Join table for many-to-many user-role mapping
create table if not exists public.user_roles (
  user_id uuid not null references public.app_users(id) on delete cascade,
  role_id bigint not null references public.roles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.app_users(id) on delete set null,
  primary key (user_id, role_id)
);

create index if not exists user_roles_user_idx on public.user_roles(user_id);
create index if not exists user_roles_role_idx on public.user_roles(role_id);

-- Keep updated_at fresh on updates
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

-- Create app user row when a new auth user is created
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Seed baseline roles
insert into public.roles (name, description)
values
  ('student', 'Student user role'),
  ('profesor', 'Profesor/teacher role'),
  ('admin', 'Application administrator'),
  ('audit', 'Read-only auditor role')
on conflict (name) do nothing;

-- Assign default "student" role to every new app user
create or replace function public.assign_default_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_role_id bigint;
begin
  select id into default_role_id
  from public.roles
  where name = 'student';

  -- Backward compatibility if a previous schema used 'user'
  if default_role_id is null then
    select id into default_role_id
    from public.roles
    where name = 'user';
  end if;

  if default_role_id is not null then
    insert into public.user_roles (user_id, role_id)
    values (new.id, default_role_id)
    on conflict (user_id, role_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_app_user_created_assign_role on public.app_users;
create trigger on_app_user_created_assign_role
after insert on public.app_users
for each row execute function public.assign_default_role();

-- 4) Row Level Security (strict policies)

-- Helper: checks if a user has admin role
create or replace function public.is_admin(_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = _user_id
      and r.name = 'admin'
  );
$$;

-- Enable RLS
alter table public.roles enable row level security;
alter table public.app_users enable row level security;
alter table public.user_roles enable row level security;

-- Lock down default grants first (RLS + least privilege)
revoke all on public.roles from anon, authenticated;
revoke all on public.app_users from anon, authenticated;
revoke all on public.user_roles from anon, authenticated;

-- Minimal table grants for authenticated users
grant select on public.roles to authenticated;
grant select, update on public.app_users to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;

-- ----- roles policies -----
drop policy if exists "roles_select_authenticated" on public.roles;
create policy "roles_select_authenticated"
on public.roles
for select
to authenticated
using (true);

drop policy if exists "roles_admin_manage" on public.roles;
create policy "roles_admin_manage"
on public.roles
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- ----- app_users policies -----
drop policy if exists "app_users_select_self_or_admin" on public.app_users;
create policy "app_users_select_self_or_admin"
on public.app_users
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists "app_users_update_self_or_admin" on public.app_users;
create policy "app_users_update_self_or_admin"
on public.app_users
for update
to authenticated
using (
  id = auth.uid()
  or public.is_admin(auth.uid())
)
with check (
  id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists "app_users_delete_admin_only" on public.app_users;
create policy "app_users_delete_admin_only"
on public.app_users
for delete
to authenticated
using (public.is_admin(auth.uid()));

-- No direct inserts by authenticated users.
-- Rows are created via trigger from auth.users (security definer).

-- ----- user_roles policies -----
drop policy if exists "user_roles_select_self_or_admin" on public.user_roles;
create policy "user_roles_select_self_or_admin"
on public.user_roles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists "user_roles_admin_insert" on public.user_roles;
create policy "user_roles_admin_insert"
on public.user_roles
for insert
to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists "user_roles_admin_update" on public.user_roles;
create policy "user_roles_admin_update"
on public.user_roles
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "user_roles_admin_delete" on public.user_roles;
create policy "user_roles_admin_delete"
on public.user_roles
for delete
to authenticated
using (public.is_admin(auth.uid()));

-- Protect system from accidental lockout: never remove the last admin role
create or replace function public.prevent_last_admin_role_removal()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  admin_role_id bigint;
  admin_count bigint;
begin
  select id into admin_role_id
  from public.roles
  where name = 'admin'
  limit 1;

  if admin_role_id is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' and old.role_id = admin_role_id then
    select count(*) into admin_count
    from public.user_roles
    where role_id = admin_role_id;

    if admin_count <= 1 then
      raise exception 'Nu poti revoca ultimul rol admin activ.';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.role_id = admin_role_id and new.role_id <> admin_role_id then
    select count(*) into admin_count
    from public.user_roles
    where role_id = admin_role_id;

    if admin_count <= 1 then
      raise exception 'Nu poti modifica ultimul rol admin activ.';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists user_roles_protect_last_admin_delete on public.user_roles;
create trigger user_roles_protect_last_admin_delete
before delete on public.user_roles
for each row execute function public.prevent_last_admin_role_removal();

drop trigger if exists user_roles_protect_last_admin_update on public.user_roles;
create trigger user_roles_protect_last_admin_update
before update on public.user_roles
for each row execute function public.prevent_last_admin_role_removal();

-- ============================================================
-- UniFlow courses + digital resources domain (teacher/admin)
-- ============================================================

-- Helper: checks if a user has profesor role
create or replace function public.is_profesor(_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = _user_id
      and r.name = 'profesor'
  );
$$;

-- Resource types used across the app
do $$
begin
  if not exists (select 1 from pg_type where typname = 'digital_resource_type') then
    create type public.digital_resource_type as enum ('tokens', 'vps_subscription');
  end if;
end $$;

-- Courses created by professors
create table if not exists public.courses (
  id bigserial primary key,
  teacher_id uuid not null references public.app_users(id) on delete restrict,
  title text not null,
  description text,
  max_students integer not null check (max_students > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists courses_teacher_idx on public.courses(teacher_id);

drop trigger if exists courses_set_updated_at on public.courses;
create trigger courses_set_updated_at
before update on public.courses
for each row execute function public.set_updated_at();

-- Requirements declared by professor when creating course
create table if not exists public.course_resource_requirements (
  id bigserial primary key,
  course_id bigint not null references public.courses(id) on delete cascade,
  resource_type public.digital_resource_type not null,
  required_amount integer not null check (required_amount >= 0),
  created_at timestamptz not null default now(),
  unique (course_id, resource_type)
);

create index if not exists course_requirements_course_idx on public.course_resource_requirements(course_id);

-- Resources allocated by admin to a course.
-- professor_bonus_amount is always 10% of required_amount (rounded up) at allocation time.
create table if not exists public.course_resource_allocations (
  id bigserial primary key,
  course_id bigint not null references public.courses(id) on delete cascade,
  resource_type public.digital_resource_type not null,
  allocated_amount integer not null check (allocated_amount >= 0),
  professor_bonus_amount integer not null check (professor_bonus_amount >= 0),
  professor_bonus_remaining integer not null check (professor_bonus_remaining >= 0),
  allocated_by uuid references public.app_users(id) on delete set null,
  allocated_at timestamptz not null default now(),
  unique (course_id, resource_type)
);

create index if not exists course_allocations_course_idx on public.course_resource_allocations(course_id);

-- Admin RPC: allocate resources for course + auto-grant 10% bonus to professor pool
create or replace function public.allocate_course_resources(
  _course_id bigint,
  _resource_type public.digital_resource_type,
  _allocated_amount integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req integer;
  bonus integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Doar admin poate aloca resurse.';
  end if;

  select required_amount into req
  from public.course_resource_requirements
  where course_id = _course_id
    and resource_type = _resource_type;

  if req is null then
    raise exception 'Nu exista cerinta de resurse pentru acest tip.';
  end if;

  -- Bonus profesor: mereu 10% din necesarul cursului (rotunjit in sus).
  -- Important: la re-alocare nu resetam bonusul ramas; il ajustam doar cu diferenta
  -- daca se modifica necesarul (si implicit bonusul).
  bonus := ((req * 10) + 99) / 100;

  insert into public.course_resource_allocations (
    course_id,
    resource_type,
    allocated_amount,
    professor_bonus_amount,
    professor_bonus_remaining,
    allocated_by
  )
  values (
    _course_id,
    _resource_type,
    greatest(_allocated_amount, 0),
    bonus,
    bonus,
    auth.uid()
  )
  on conflict (course_id, resource_type) do update
  set allocated_amount = excluded.allocated_amount,
      professor_bonus_amount = excluded.professor_bonus_amount,
      professor_bonus_remaining = greatest(
        public.course_resource_allocations.professor_bonus_remaining
        + (excluded.professor_bonus_amount - public.course_resource_allocations.professor_bonus_amount),
        0
      ),
      allocated_by = excluded.allocated_by,
      allocated_at = now();
end;
$$;

-- ============================================================
-- RLS + grants for new tables
-- ============================================================

alter table public.courses enable row level security;
alter table public.course_resource_requirements enable row level security;
alter table public.course_resource_allocations enable row level security;

revoke all on public.courses from anon, authenticated;
revoke all on public.course_resource_requirements from anon, authenticated;
revoke all on public.course_resource_allocations from anon, authenticated;

grant select, insert, update, delete on public.courses to authenticated;
grant select, insert, update, delete on public.course_resource_requirements to authenticated;
grant select on public.course_resource_allocations to authenticated;

-- courses: teachers manage own, admin manages all
drop policy if exists "courses_select_teacher_or_admin" on public.courses;
create policy "courses_select_teacher_or_admin"
on public.courses
for select
to authenticated
using (
  teacher_id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists "courses_insert_teacher_or_admin" on public.courses;
create policy "courses_insert_teacher_or_admin"
on public.courses
for insert
to authenticated
with check (
  (teacher_id = auth.uid() and public.is_profesor(auth.uid()))
  or public.is_admin(auth.uid())
);

drop policy if exists "courses_update_teacher_or_admin" on public.courses;
create policy "courses_update_teacher_or_admin"
on public.courses
for update
to authenticated
using (
  teacher_id = auth.uid()
  or public.is_admin(auth.uid())
)
with check (
  teacher_id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists "courses_delete_teacher_or_admin" on public.courses;
create policy "courses_delete_teacher_or_admin"
on public.courses
for delete
to authenticated
using (
  teacher_id = auth.uid()
  or public.is_admin(auth.uid())
);

-- requirements: teacher/admin access through owning course
drop policy if exists "course_requirements_select_teacher_or_admin" on public.course_resource_requirements;
create policy "course_requirements_select_teacher_or_admin"
on public.course_resource_requirements
for select
to authenticated
using (
  exists (
    select 1 from public.courses c
    where c.id = course_id
      and (c.teacher_id = auth.uid() or public.is_admin(auth.uid()))
  )
);

drop policy if exists "course_requirements_insert_teacher_or_admin" on public.course_resource_requirements;
create policy "course_requirements_insert_teacher_or_admin"
on public.course_resource_requirements
for insert
to authenticated
with check (
  exists (
    select 1 from public.courses c
    where c.id = course_id
      and (c.teacher_id = auth.uid() or public.is_admin(auth.uid()))
  )
);

drop policy if exists "course_requirements_update_teacher_or_admin" on public.course_resource_requirements;
create policy "course_requirements_update_teacher_or_admin"
on public.course_resource_requirements
for update
to authenticated
using (
  exists (
    select 1 from public.courses c
    where c.id = course_id
      and (c.teacher_id = auth.uid() or public.is_admin(auth.uid()))
  )
)
with check (
  exists (
    select 1 from public.courses c
    where c.id = course_id
      and (c.teacher_id = auth.uid() or public.is_admin(auth.uid()))
  )
);

drop policy if exists "course_requirements_delete_teacher_or_admin" on public.course_resource_requirements;
create policy "course_requirements_delete_teacher_or_admin"
on public.course_resource_requirements
for delete
to authenticated
using (
  exists (
    select 1 from public.courses c
    where c.id = course_id
      and (c.teacher_id = auth.uid() or public.is_admin(auth.uid()))
  )
);

-- allocations: select for course owner/admin; writes only via RPC (security definer)
drop policy if exists "course_allocations_select_teacher_or_admin" on public.course_resource_allocations;
create policy "course_allocations_select_teacher_or_admin"
on public.course_resource_allocations
for select
to authenticated
using (
  exists (
    select 1 from public.courses c
    where c.id = course_id
      and (c.teacher_id = auth.uid() or public.is_admin(auth.uid()))
  )
);
