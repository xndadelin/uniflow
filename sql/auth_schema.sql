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
grant select on public.user_roles to authenticated;

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
