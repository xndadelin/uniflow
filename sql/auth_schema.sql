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

-- ============================================================
-- Admin domain (inventory, activities, vps credentials email outbox)
-- ============================================================

-- Global inventory for digital resources (admin managed)
create table if not exists public.resource_inventory (
  resource_type public.digital_resource_type primary key,
  total_amount integer not null default 0 check (total_amount >= 0),
  remaining_amount integer not null default 0 check (remaining_amount >= 0),
  updated_at timestamptz not null default now()
);

drop trigger if exists resource_inventory_set_updated_at on public.resource_inventory;
create trigger resource_inventory_set_updated_at
before update on public.resource_inventory
for each row execute function public.set_updated_at();

-- Seed inventory rows for both resource types (idempotent)
insert into public.resource_inventory (resource_type, total_amount, remaining_amount)
values ('tokens', 0, 0), ('vps_subscription', 0, 0)
on conflict (resource_type) do nothing;

-- Admin activities (minimum 10 required for grading)
create table if not exists public.admin_activities (
  id bigserial primary key,
  title text not null,
  description text,
  token_cost integer not null default 0 check (token_cost >= 0),
  created_at timestamptz not null default now()
);

-- Ensure activity titles are unique (needed for upsert/seed by title)
create unique index if not exists admin_activities_title_uidx on public.admin_activities (title);

-- Seed default catalog (idempotent) so it exists "by default", without pressing a button.
-- Also removes old placeholder rows used in earlier iterations.
delete from public.admin_activities
where title ~ '^Activitate [0-9]+$'
  and coalesce(description, '') = 'Seed pentru punctaj'
  and token_cost = 0;

insert into public.admin_activities (title, description, token_cost)
values
  ('Rezumat text', 'Rezumat/explicare text cu AI', 10),
  ('Generare imagine', 'Generare imagine cu AI', 50),
  ('Asistenta dezvoltare software', 'Asistenta la dezvoltare aplicatii software', 5000),
  ('Traducere text', 'Traducere text (RO/EN/FR etc.)', 25),
  ('Corectare gramatica', 'Corectare gramatica si stil', 15),
  ('Analiza cod', 'Analiza si explicare cod', 200),
  ('Generare teste', 'Generare suite de teste unitare', 800),
  ('Debugging ghidat', 'Diagnosticare si pasi de rezolvare', 600),
  ('Generare documentatie', 'Documentatie pentru proiect/feature', 300),
  ('Plan de invatare', 'Plan personalizat de invatare', 120)
on conflict (title) do update
set description = excluded.description,
    token_cost = excluded.token_cost;

-- ============================================================
-- Course-scoped activities (token consumption catalog per course)
-- ============================================================
create table if not exists public.course_activities (
  id bigserial primary key,
  course_id bigint not null references public.courses(id) on delete cascade,
  title text not null,
  description text,
  token_cost integer not null default 0 check (token_cost >= 0),
  created_at timestamptz not null default now(),
  unique (course_id, title)
);

create index if not exists course_activities_course_idx on public.course_activities(course_id);

-- Seed defaults for every new course (idempotent per course)
create or replace function public.seed_course_activities_defaults(_course_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Doar admin poate popula activitati.';
  end if;

  insert into public.course_activities (course_id, title, description, token_cost)
  values
    (_course_id, 'Rezumat text', 'Rezumat/explicare text cu AI', 10),
    (_course_id, 'Generare imagine', 'Generare imagine cu AI', 50),
    (_course_id, 'Asistenta dezvoltare software', 'Asistenta la dezvoltare aplicatii software', 5000),
    (_course_id, 'Traducere text', 'Traducere text (RO/EN/FR etc.)', 25),
    (_course_id, 'Corectare gramatica', 'Corectare gramatica si stil', 15),
    (_course_id, 'Analiza cod', 'Analiza si explicare cod', 200),
    (_course_id, 'Generare teste', 'Generare suite de teste unitare', 800),
    (_course_id, 'Debugging ghidat', 'Diagnosticare si pasi de rezolvare', 600),
    (_course_id, 'Generare documentatie', 'Documentatie pentru proiect/feature', 300),
    (_course_id, 'Plan de invatare', 'Plan personalizat de invatare', 120)
  on conflict (course_id, title) do update
  set description = excluded.description,
      token_cost = excluded.token_cost;
end;
$$;

-- Optional helper: called after course creation to seed defaults automatically.
create or replace function public.handle_new_course_seed_activities()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- We cannot rely on auth.uid() inside trigger the same way; allow seeding without admin check here.
  insert into public.course_activities (course_id, title, description, token_cost)
  values
    (new.id, 'Rezumat text', 'Rezumat/explicare text cu AI', 10),
    (new.id, 'Generare imagine', 'Generare imagine cu AI', 50),
    (new.id, 'Asistenta dezvoltare software', 'Asistenta la dezvoltare aplicatii software', 5000),
    (new.id, 'Traducere text', 'Traducere text (RO/EN/FR etc.)', 25),
    (new.id, 'Corectare gramatica', 'Corectare gramatica si stil', 15),
    (new.id, 'Analiza cod', 'Analiza si explicare cod', 200),
    (new.id, 'Generare teste', 'Generare suite de teste unitare', 800),
    (new.id, 'Debugging ghidat', 'Diagnosticare si pasi de rezolvare', 600),
    (new.id, 'Generare documentatie', 'Documentatie pentru proiect/feature', 300),
    (new.id, 'Plan de invatare', 'Plan personalizat de invatare', 120)
  on conflict (course_id, title) do update
  set description = excluded.description,
      token_cost = excluded.token_cost;

  return new;
end;
$$;

drop trigger if exists on_course_created_seed_activities on public.courses;
create trigger on_course_created_seed_activities
after insert on public.courses
for each row execute function public.handle_new_course_seed_activities();

create or replace function public.create_course_activity(
  _course_id bigint,
  _title text,
  _description text,
  _token_cost integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Doar admin poate crea activitati.';
  end if;

  if coalesce(trim(_title), '') = '' then
    raise exception 'Titlu invalid.';
  end if;

  if _token_cost is null or _token_cost < 0 then
    raise exception 'Token cost invalid.';
  end if;

  insert into public.course_activities (course_id, title, description, token_cost)
  values (_course_id, trim(_title), nullif(trim(_description), ''), _token_cost)
  on conflict (course_id, title) do update
  set description = excluded.description,
      token_cost = excluded.token_cost;
end;
$$;

-- Student RPC: consume tokens based on a course activity definition
create or replace function public.consume_tokens_for_activity(
  _course_id bigint,
  _activity_id bigint,
  _note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost integer;
  v_granted integer;
  v_consumed integer;
  v_remaining integer;
begin
  if auth.uid() is null then
    raise exception 'Trebuie sa fii autentificat.';
  end if;

  if not public.is_enrolled_in_course(_course_id, auth.uid()) then
    raise exception 'Nu esti inrolat la acest curs.';
  end if;

  select token_cost into v_cost
  from public.course_activities
  where id = _activity_id
    and course_id = _course_id;

  if v_cost is null then
    raise exception 'Activitate inexistenta.';
  end if;

  select granted_amount, consumed_amount into v_granted, v_consumed
  from public.course_student_resources
  where course_id = _course_id
    and student_id = auth.uid()
    and resource_type = 'tokens';

  v_granted := coalesce(v_granted, 0);
  v_consumed := coalesce(v_consumed, 0);
  v_remaining := greatest(v_granted - v_consumed, 0);

  if v_remaining < v_cost then
    raise exception 'Token-uri insuficiente.';
  end if;

  insert into public.course_token_activities (course_id, student_id, tokens_used, note)
  values (_course_id, auth.uid(), v_cost, coalesce(_note, 'activity_id=' || _activity_id));

  update public.course_student_resources
  set consumed_amount = consumed_amount + v_cost
  where course_id = _course_id
    and student_id = auth.uid()
    and resource_type = 'tokens';
end;
$$;

-- Migration helper (idempotent)
alter table public.admin_activities
  add column if not exists token_cost integer not null default 0;

create or replace function public.seed_admin_activities_min_10()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Doar admin poate popula activitati.';
  end if;

  -- Cleanup old placeholder seed rows (so defaults show up nicely in UI).
  delete from public.admin_activities
  where title ~ '^Activitate [0-9]+$'
    and coalesce(description, '') = 'Seed pentru punctaj'
    and token_cost = 0;

  -- Ensure the default catalog exists (idempotent; updates values if they already exist).
  insert into public.admin_activities (title, description, token_cost)
  values
    ('Rezumat text', 'Rezumat/explicare text cu AI', 10),
    ('Generare imagine', 'Generare imagine cu AI', 50),
    ('Asistenta dezvoltare software', 'Asistenta la dezvoltare aplicatii software', 5000),
    ('Traducere text', 'Traducere text (RO/EN/FR etc.)', 25),
    ('Corectare gramatica', 'Corectare gramatica si stil', 15),
    ('Analiza cod', 'Analiza si explicare cod', 200),
    ('Generare teste', 'Generare suite de teste unitare', 800),
    ('Debugging ghidat', 'Diagnosticare si pasi de rezolvare', 600),
    ('Generare documentatie', 'Documentatie pentru proiect/feature', 300),
    ('Plan de invatare', 'Plan personalizat de invatare', 120)
  on conflict (title) do update
  set description = excluded.description,
      token_cost = excluded.token_cost;
end;
$$;

-- Admin RPC: add an activity with token cost
create or replace function public.create_admin_activity(
  _title text,
  _description text,
  _token_cost integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Doar admin poate crea activitati.';
  end if;

  if coalesce(trim(_title), '') = '' then
    raise exception 'Titlu invalid.';
  end if;

  if _token_cost is null or _token_cost < 0 then
    raise exception 'Token cost invalid.';
  end if;

  insert into public.admin_activities (title, description, token_cost)
  values (trim(_title), nullif(trim(_description), ''), _token_cost);
end;
$$;

-- Admin RPC: compute required totals from professor requirements and max_students, plus >=10% extra.
create or replace function public.get_suggested_inventory()
returns table (
  resource_type public.digital_resource_type,
  required_total integer,
  suggested_total integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.resource_type,
    coalesce(sum((r.required_per_student::bigint) * (c.max_students::bigint)), 0)::int as required_total,
    (
      (
        coalesce(sum((r.required_per_student::bigint) * (c.max_students::bigint)), 0)::numeric * 110
      ) + 99
    ) / 100
    ::int as suggested_total
  from public.course_resource_requirements r
  join public.courses c on c.id = r.course_id
  group by r.resource_type
  order by r.resource_type;
$$;

-- VPS credentials per student (assigned by admin, can be "sent" via outbox)
create table if not exists public.vps_credentials (
  id bigserial primary key,
  course_id bigint references public.courses(id) on delete cascade,
  student_id uuid references public.app_users(id) on delete cascade,
  username text not null,
  password text not null,
  host text,
  port integer,
  assigned_at timestamptz not null default now(),
  unique (course_id, student_id)
);

-- Email outbox (simulated mail distribution)
create table if not exists public.email_outbox (
  id bigserial primary key,
  to_email text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- Admin RPC: set inventory totals (remaining is reset to total)
create or replace function public.set_resource_inventory(
  _resource_type public.digital_resource_type,
  _total integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Doar admin poate seta inventarul.';
  end if;

  insert into public.resource_inventory (resource_type, total_amount, remaining_amount)
  values (_resource_type, greatest(_total, 0), greatest(_total, 0))
  on conflict (resource_type) do update
  set total_amount = excluded.total_amount,
      remaining_amount = excluded.remaining_amount,
      updated_at = now();
end;
$$;

-- Admin RPC: allocate course resources AND subtract from global inventory (tokens/VPS)
create or replace function public.allocate_course_resources_from_inventory(
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
  inv_remaining integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Doar admin poate aloca resurse.';
  end if;

  select remaining_amount into inv_remaining
  from public.resource_inventory
  where resource_type = _resource_type;

  if inv_remaining is null then
    raise exception 'Inventar inexistent pentru acest tip.';
  end if;

  if inv_remaining < greatest(_allocated_amount, 0) then
    raise exception 'Inventar insuficient: ramas %, cerut %.', inv_remaining, greatest(_allocated_amount, 0);
  end if;

  update public.resource_inventory
  set remaining_amount = remaining_amount - greatest(_allocated_amount, 0)
  where resource_type = _resource_type;

  perform public.allocate_course_resources(_course_id, _resource_type, _allocated_amount);
end;
$$;

-- Admin RPC: assign VPS credentials to enrolled students and queue emails (outbox)
create or replace function public.assign_vps_credentials_and_queue_emails(
  _course_id bigint,
  _default_host text,
  _default_port integer default 22
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_username text;
  v_password text;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Doar admin poate distribui credentiale.';
  end if;

  for r in
    select e.student_id, u.email
    from public.course_enrollments e
    join public.app_users u on u.id = e.student_id
    where e.course_id = _course_id
  loop
    -- Create credential if missing (simple deterministic username/password for demo; replace in production)
    v_username := 'student_' || left(r.student_id::text, 8);
    v_password := left(md5(r.student_id::text), 12);

    insert into public.vps_credentials (course_id, student_id, username, password, host, port)
    values (_course_id, r.student_id, v_username, v_password, _default_host, _default_port)
    on conflict (course_id, student_id) do update
    set host = excluded.host,
        port = excluded.port;

    insert into public.email_outbox (to_email, subject, body)
    values (
      r.email,
      'Credențiale VPS - UniFlow',
      'Curs #' || _course_id || E'\n' ||
      'Host/IP: ' || _default_host || E'\n' ||
      'Port: ' || _default_port || E'\n' ||
      'User: ' || v_username || E'\n' ||
      'Parola: ' || v_password || E'\n' ||
      E'\n' ||
      'Validare utilizare (simulata):' || E'\n' ||
      'Deschide direct cu parametri:' || E'\n' ||
      'https://httpbin.org/get?course_id=' || _course_id ||
        '&host=' || _default_host ||
        '&port=' || _default_port ||
        '&username=' || v_username ||
        '&password=' || v_password || E'\n' ||
      E'\n' ||
      'Sau POST (echo json): https://httpbin.org/post' || E'\n' ||
      E'\n' ||
      'Nota: In platforma, sectiunea VPS poate rula validarea automat si consuma 1 abonament.'
    );
  end loop;
end;
$$;

-- Courses created by professors
create table if not exists public.courses (
  id bigserial primary key,
  teacher_id uuid not null references public.app_users(id) on delete restrict,
  title text not null,
  description text,
  enrollment_open boolean not null default true,
  max_students integer not null check (max_students > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists courses_teacher_idx on public.courses(teacher_id);

-- Migration helper for existing DBs (idempotent)
alter table public.courses
  add column if not exists enrollment_open boolean not null default true;

drop trigger if exists courses_set_updated_at on public.courses;
create trigger courses_set_updated_at
before update on public.courses
for each row execute function public.set_updated_at();

-- Requirements declared by professor when creating course
create table if not exists public.course_resource_requirements (
  id bigserial primary key,
  course_id bigint not null references public.courses(id) on delete cascade,
  resource_type public.digital_resource_type not null,
  -- New model: resources required per student (used to derive total needed for the course).
  -- Backward compatibility: keep required_amount for older deployments.
  required_per_student integer not null default 0 check (required_per_student >= 0),
  required_amount integer not null check (required_amount >= 0),
  created_at timestamptz not null default now(),
  unique (course_id, resource_type)
);

create index if not exists course_requirements_course_idx on public.course_resource_requirements(course_id);

-- Migration helper for existing DBs (idempotent)
alter table public.course_resource_requirements
  add column if not exists required_per_student integer not null default 0;

-- Students enrolled to courses
create table if not exists public.course_enrollments (
  course_id bigint not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.app_users(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  primary key (course_id, student_id)
);

create index if not exists course_enrollments_student_idx on public.course_enrollments(student_id);

-- Auto-apply baseline grants whenever an enrollment is created (covers inserts not going through RPC).
create or replace function public.handle_new_course_enrollment_apply_baseline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_baseline_grants_for_student(new.course_id, new.student_id);
  return new;
end;
$$;

drop trigger if exists on_course_enrollment_created_apply_baseline on public.course_enrollments;
create trigger on_course_enrollment_created_apply_baseline
after insert on public.course_enrollments
for each row execute function public.handle_new_course_enrollment_apply_baseline();

-- ============================================================
-- Course page domain (materials, student resources, requests, homework, simulations)
-- ============================================================

-- Materials uploaded by teacher for a course
create table if not exists public.course_materials (
  id bigserial primary key,
  course_id bigint not null references public.courses(id) on delete cascade,
  teacher_id uuid not null references public.app_users(id) on delete restrict,
  title text not null,
  description text,
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists course_materials_course_idx on public.course_materials(course_id);

-- Student resources ledger per course (granted - consumed = remaining)
create table if not exists public.course_student_resources (
  course_id bigint not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.app_users(id) on delete cascade,
  resource_type public.digital_resource_type not null,
  granted_amount integer not null default 0 check (granted_amount >= 0),
  consumed_amount integer not null default 0 check (consumed_amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (course_id, student_id, resource_type)
);

create index if not exists course_student_resources_student_idx on public.course_student_resources(student_id);

drop trigger if exists course_student_resources_set_updated_at on public.course_student_resources;
create trigger course_student_resources_set_updated_at
before update on public.course_student_resources
for each row execute function public.set_updated_at();

-- Requests for extra resources (student -> teacher pool)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'course_resource_request_status') then
    create type public.course_resource_request_status as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

create table if not exists public.course_resource_requests (
  id bigserial primary key,
  course_id bigint not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.app_users(id) on delete cascade,
  resource_type public.digital_resource_type not null,
  requested_amount integer not null check (requested_amount > 0),
  status public.course_resource_request_status not null default 'pending',
  decided_by uuid references public.app_users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists course_resource_requests_course_idx on public.course_resource_requests(course_id);
create index if not exists course_resource_requests_student_idx on public.course_resource_requests(student_id);

-- Homework uploads (student submissions)
create table if not exists public.course_homework_submissions (
  id bigserial primary key,
  course_id bigint not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.app_users(id) on delete cascade,
  title text not null,
  file_url text not null,
  submitted_at timestamptz not null default now()
);

create index if not exists course_homework_course_idx on public.course_homework_submissions(course_id);
create index if not exists course_homework_student_idx on public.course_homework_submissions(student_id);

-- Token consumption simulation activities
create table if not exists public.course_token_activities (
  id bigserial primary key,
  course_id bigint not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.app_users(id) on delete cascade,
  tokens_used integer not null check (tokens_used > 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists course_token_activities_course_idx on public.course_token_activities(course_id);
create index if not exists course_token_activities_student_idx on public.course_token_activities(student_id);

-- VPS validation simulation
create table if not exists public.course_vps_validations (
  id bigserial primary key,
  course_id bigint not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.app_users(id) on delete cascade,
  is_valid boolean not null default true,
  note text,
  validated_at timestamptz not null default now()
);

create index if not exists course_vps_validations_course_idx on public.course_vps_validations(course_id);
create index if not exists course_vps_validations_student_idx on public.course_vps_validations(student_id);

-- Helper: check enrollment
create or replace function public.is_enrolled_in_course(_course_id bigint, _student_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.course_enrollments e
    where e.course_id = _course_id
      and e.student_id = _student_id
  );
$$;

-- Student RPC: request extra resources
create or replace function public.request_course_resources(
  _course_id bigint,
  _resource_type public.digital_resource_type,
  _requested_amount integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Trebuie sa fii autentificat.';
  end if;

  if not public.is_enrolled_in_course(_course_id, auth.uid()) then
    raise exception 'Nu esti inrolat la acest curs.';
  end if;

  if _requested_amount is null or _requested_amount <= 0 then
    raise exception 'Cantitate invalida.';
  end if;

  insert into public.course_resource_requests (course_id, student_id, resource_type, requested_amount)
  values (_course_id, auth.uid(), _resource_type, _requested_amount);
end;
$$;

-- Teacher/admin RPC: approve request and grant from professor bonus pool (10%)
create or replace function public.approve_course_resource_request(_request_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id bigint;
  v_student_id uuid;
  v_type public.digital_resource_type;
  v_amount integer;
  v_teacher_id uuid;
  v_bonus_remaining integer;
begin
  if auth.uid() is null then
    raise exception 'Trebuie sa fii autentificat.';
  end if;

  select r.course_id, r.student_id, r.resource_type, r.requested_amount
  into v_course_id, v_student_id, v_type, v_amount
  from public.course_resource_requests r
  where r.id = _request_id
    and r.status = 'pending';

  if v_course_id is null then
    raise exception 'Cerere inexistenta sau deja procesata.';
  end if;

  select c.teacher_id into v_teacher_id
  from public.courses c
  where c.id = v_course_id;

  if not (public.is_admin(auth.uid()) or v_teacher_id = auth.uid()) then
    raise exception 'Doar profesorul cursului sau admin poate aproba.';
  end if;

  select a.professor_bonus_remaining into v_bonus_remaining
  from public.course_resource_allocations a
  where a.course_id = v_course_id
    and a.resource_type = v_type;

  if v_bonus_remaining is null then
    raise exception 'Nu exista alocare de resurse pentru acest tip.';
  end if;

  if v_bonus_remaining < v_amount then
    raise exception 'Bonus insuficient pentru aprobare.';
  end if;

  update public.course_resource_allocations
  set professor_bonus_remaining = professor_bonus_remaining - v_amount
  where course_id = v_course_id
    and resource_type = v_type;

  insert into public.course_student_resources (course_id, student_id, resource_type, granted_amount, consumed_amount)
  values (v_course_id, v_student_id, v_type, v_amount, 0)
  on conflict (course_id, student_id, resource_type) do update
  set granted_amount = public.course_student_resources.granted_amount + excluded.granted_amount;

  update public.course_resource_requests
  set status = 'approved',
      decided_by = auth.uid(),
      decided_at = now()
  where id = _request_id;
end;
$$;

-- Teacher/admin RPC: reject request
create or replace function public.reject_course_resource_request(_request_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id bigint;
  v_teacher_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Trebuie sa fii autentificat.';
  end if;

  select r.course_id into v_course_id
  from public.course_resource_requests r
  where r.id = _request_id
    and r.status = 'pending';

  if v_course_id is null then
    raise exception 'Cerere inexistenta sau deja procesata.';
  end if;

  select c.teacher_id into v_teacher_id
  from public.courses c
  where c.id = v_course_id;

  if not (public.is_admin(auth.uid()) or v_teacher_id = auth.uid()) then
    raise exception 'Doar profesorul cursului sau admin poate respinge.';
  end if;

  update public.course_resource_requests
  set status = 'rejected',
      decided_by = auth.uid(),
      decided_at = now()
  where id = _request_id;
end;
$$;

-- Student RPC: upload homework link (file_url)
create or replace function public.submit_homework(
  _course_id bigint,
  _title text,
  _file_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Trebuie sa fii autentificat.';
  end if;

  if not public.is_enrolled_in_course(_course_id, auth.uid()) then
    raise exception 'Nu esti inrolat la acest curs.';
  end if;

  if coalesce(trim(_title), '') = '' then
    raise exception 'Titlu invalid.';
  end if;

  if coalesce(trim(_file_url), '') = '' then
    raise exception 'URL invalid.';
  end if;

  insert into public.course_homework_submissions (course_id, student_id, title, file_url)
  values (_course_id, auth.uid(), trim(_title), trim(_file_url));
end;
$$;

-- Student RPC: simulate token usage (consumes from remaining)
create or replace function public.simulate_token_usage(
  _course_id bigint,
  _tokens_used integer,
  _note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_granted integer;
  v_consumed integer;
  v_remaining integer;
begin
  if auth.uid() is null then
    raise exception 'Trebuie sa fii autentificat.';
  end if;

  if not public.is_enrolled_in_course(_course_id, auth.uid()) then
    raise exception 'Nu esti inrolat la acest curs.';
  end if;

  if _tokens_used is null or _tokens_used <= 0 then
    raise exception 'Cantitate invalida.';
  end if;

  select granted_amount, consumed_amount into v_granted, v_consumed
  from public.course_student_resources
  where course_id = _course_id
    and student_id = auth.uid()
    and resource_type = 'tokens';

  v_granted := coalesce(v_granted, 0);
  v_consumed := coalesce(v_consumed, 0);
  v_remaining := greatest(v_granted - v_consumed, 0);

  if v_remaining < _tokens_used then
    raise exception 'Token-uri insuficiente.';
  end if;

  insert into public.course_token_activities (course_id, student_id, tokens_used, note)
  values (_course_id, auth.uid(), _tokens_used, _note);

  update public.course_student_resources
  set consumed_amount = consumed_amount + _tokens_used
  where course_id = _course_id
    and student_id = auth.uid()
    and resource_type = 'tokens';
end;
$$;

-- Student RPC: simulate VPS validation (consumes 1 unit)
create or replace function public.simulate_vps_validation(
  _course_id bigint,
  _is_valid boolean,
  _note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_granted integer;
  v_consumed integer;
  v_remaining integer;
begin
  if auth.uid() is null then
    raise exception 'Trebuie sa fii autentificat.';
  end if;

  if not public.is_enrolled_in_course(_course_id, auth.uid()) then
    raise exception 'Nu esti inrolat la acest curs.';
  end if;

  select granted_amount, consumed_amount into v_granted, v_consumed
  from public.course_student_resources
  where course_id = _course_id
    and student_id = auth.uid()
    and resource_type = 'vps_subscription';

  v_granted := coalesce(v_granted, 0);
  v_consumed := coalesce(v_consumed, 0);
  v_remaining := greatest(v_granted - v_consumed, 0);

  if v_remaining < 1 then
    raise exception 'Abonamente VPS insuficiente.';
  end if;

  insert into public.course_vps_validations (course_id, student_id, is_valid, note)
  values (_course_id, auth.uid(), coalesce(_is_valid, false), _note);

  update public.course_student_resources
  set consumed_amount = consumed_amount + 1
  where course_id = _course_id
    and student_id = auth.uid()
    and resource_type = 'vps_subscription';
end;
$$;

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

-- Student RPC: enroll in a course if enrollment is open and capacity allows
create or replace function public.enroll_in_course(_course_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max integer;
  c_open boolean;
  enrolled_count integer;
begin
  if auth.uid() is null then
    raise exception 'Trebuie sa fii autentificat.';
  end if;

  select max_students, enrollment_open into c_max, c_open
  from public.courses
  where id = _course_id;

  if c_max is null then
    raise exception 'Curs inexistent.';
  end if;

  if c_open is not true then
    raise exception 'Inscrierea nu este deschisa pentru acest curs.';
  end if;

  select count(*) into enrolled_count
  from public.course_enrollments
  where course_id = _course_id;

  if enrolled_count >= c_max then
    raise exception 'Cursul este plin.';
  end if;

  insert into public.course_enrollments (course_id, student_id)
  values (_course_id, auth.uid())
  on conflict (course_id, student_id) do nothing;

  -- Auto-distribute baseline per-student resources on enrollment (if requirements exist).
  perform public.apply_baseline_grants_for_student(_course_id, auth.uid());
end;
$$;

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

  -- Total needed is derived from per-student requirement * max_students.
  -- If older column is used, fall back to required_amount.
  select
    coalesce((r.required_per_student * c.max_students), r.required_amount) into req
  from public.course_resource_requirements r
  join public.courses c on c.id = r.course_id
  where r.course_id = _course_id
    and r.resource_type = _resource_type;

  if req is null then
    raise exception 'Nu exista cerinta de resurse pentru acest tip.';
  end if;

  -- Bonus profesor: mereu 10% din necesarul cursului (rotunjit in sus).
  -- Important: la re-alocare nu resetam bonusul ramas; il ajustam doar cu diferenta
  -- daca se modifica necesarul (si implicit bonusul).
  bonus := (((req::numeric) * 10) + 99) / 100 ::int;

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

  -- Auto-distribute to currently enrolled students, based on per-student requirement.
  perform public.distribute_course_resources_to_students(_course_id, _resource_type);
end;
$$;

-- Baseline grants for a student based on professor requirements (per student).
-- Called automatically on enrollment, and can be reused by other flows.
create or replace function public.apply_baseline_grants_for_student(
  _course_id bigint,
  _student_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  per_student integer;
  enrolled_count integer;
  allocated integer;
  grant_per_student integer;
begin
  for per_student, allocated in
    select r.required_per_student, a.allocated_amount
    from public.course_resource_requirements r
    join public.course_resource_allocations a
      on a.course_id = r.course_id
     and a.resource_type = r.resource_type
    where r.course_id = _course_id
  loop
    -- enrolled count is per course; used to compute uniform per-student grant under partial allocation
    select count(*) into enrolled_count
    from public.course_enrollments
    where course_id = _course_id;

    if coalesce(enrolled_count, 0) <= 0 then
      grant_per_student := 0;
    else
      grant_per_student := least(greatest(per_student, 0), floor((greatest(allocated, 0)::numeric) / enrolled_count)::int);
    end if;

    insert into public.course_student_resources (course_id, student_id, resource_type, granted_amount, consumed_amount)
    select
      _course_id,
      _student_id,
      r.resource_type,
      grant_per_student,
      0
    from public.course_resource_requirements r
    where r.course_id = _course_id
      and r.required_per_student = per_student
    limit 1
    on conflict (course_id, student_id, resource_type) do update
    set granted_amount = excluded.granted_amount;
  end loop;
end;
$$;

-- Backfill: ensure baseline grants exist for all current enrollments (idempotent).
insert into public.course_student_resources (course_id, student_id, resource_type, granted_amount, consumed_amount)
select
  e.course_id,
  e.student_id,
  r.resource_type,
  least(
    greatest(r.required_per_student, 0),
    case
      when (select count(*) from public.course_enrollments e2 where e2.course_id = e.course_id) <= 0 then 0
      else floor((greatest(a.allocated_amount, 0)::numeric) / (select count(*) from public.course_enrollments e2 where e2.course_id = e.course_id))::int
    end
  ),
  0
from public.course_enrollments e
join public.course_resource_requirements r on r.course_id = e.course_id
join public.course_resource_allocations a
  on a.course_id = r.course_id
 and a.resource_type = r.resource_type
on conflict (course_id, student_id, resource_type) do update
set granted_amount = excluded.granted_amount;

-- Admin RPC: distribute allocated resources to enrolled students based on professor requirements (per student).
-- This sets/updates the baseline "granted_amount" for each enrolled student for a given course + resource_type.
create or replace function public.distribute_course_resources_to_students(
  _course_id bigint,
  _resource_type public.digital_resource_type
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  per_student integer;
  enrolled_count integer;
  allocated integer;
  grant_per_student integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Doar admin poate distribui resurse.';
  end if;

  select required_per_student into per_student
  from public.course_resource_requirements
  where course_id = _course_id
    and resource_type = _resource_type;

  if per_student is null then
    raise exception 'Nu exista necesar setat de profesor pentru acest tip de resursa.';
  end if;

  select count(*) into enrolled_count
  from public.course_enrollments
  where course_id = _course_id;

  select allocated_amount into allocated
  from public.course_resource_allocations
  where course_id = _course_id
    and resource_type = _resource_type;

  if allocated is null then
    raise exception 'Nu exista alocare admin pentru acest tip de resursa.';
  end if;

  if coalesce(enrolled_count, 0) <= 0 then
    grant_per_student := 0;
  else
    -- Best effort: distribute uniformly up to professor requirement.
    grant_per_student := least(greatest(per_student, 0), floor((greatest(allocated, 0)::numeric) / enrolled_count)::int);
  end if;

  -- Upsert baseline grants for each enrolled student.
  insert into public.course_student_resources (course_id, student_id, resource_type, granted_amount, consumed_amount)
  select
    e.course_id,
    e.student_id,
    _resource_type,
    grant_per_student,
    0
  from public.course_enrollments e
  where e.course_id = _course_id
  on conflict (course_id, student_id, resource_type) do update
  set granted_amount = excluded.granted_amount;
end;
$$;

-- ============================================================
-- RLS + grants for new tables
-- ============================================================

alter table public.courses enable row level security;
alter table public.resource_inventory enable row level security;
alter table public.admin_activities enable row level security;
alter table public.vps_credentials enable row level security;
alter table public.email_outbox enable row level security;
alter table public.course_resource_requirements enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.course_materials enable row level security;
alter table public.course_student_resources enable row level security;
alter table public.course_resource_requests enable row level security;
alter table public.course_homework_submissions enable row level security;
alter table public.course_token_activities enable row level security;
alter table public.course_vps_validations enable row level security;
alter table public.course_resource_allocations enable row level security;
alter table public.course_activities enable row level security;

revoke all on public.courses from anon, authenticated;
revoke all on public.resource_inventory from anon, authenticated;
revoke all on public.admin_activities from anon, authenticated;
revoke all on public.vps_credentials from anon, authenticated;
revoke all on public.email_outbox from anon, authenticated;
revoke all on public.course_resource_requirements from anon, authenticated;
revoke all on public.course_enrollments from anon, authenticated;
revoke all on public.course_materials from anon, authenticated;
revoke all on public.course_student_resources from anon, authenticated;
revoke all on public.course_resource_requests from anon, authenticated;
revoke all on public.course_homework_submissions from anon, authenticated;
revoke all on public.course_token_activities from anon, authenticated;
revoke all on public.course_vps_validations from anon, authenticated;
revoke all on public.course_resource_allocations from anon, authenticated;
revoke all on public.course_activities from anon, authenticated;

grant select, insert, update, delete on public.courses to authenticated;
grant select on public.resource_inventory to authenticated;
grant select on public.admin_activities to authenticated;
grant select on public.vps_credentials to authenticated;
grant select, update on public.email_outbox to authenticated;
grant select, insert, update, delete on public.course_resource_requirements to authenticated;
grant select on public.course_enrollments to authenticated;
grant select on public.course_materials to authenticated;
grant select on public.course_student_resources to authenticated;
grant select, insert on public.course_resource_requests to authenticated;
grant select, insert on public.course_homework_submissions to authenticated;
grant select on public.course_token_activities to authenticated;
grant select on public.course_vps_validations to authenticated;
grant select on public.course_resource_allocations to authenticated;
grant select on public.course_activities to authenticated;

revoke all on function public.enroll_in_course(bigint) from public;
grant execute on function public.enroll_in_course(bigint) to authenticated;

revoke all on function public.seed_admin_activities_min_10() from public;
grant execute on function public.seed_admin_activities_min_10() to authenticated;

revoke all on function public.create_admin_activity(text, text, integer) from public;
grant execute on function public.create_admin_activity(text, text, integer) to authenticated;

revoke all on function public.get_suggested_inventory() from public;
grant execute on function public.get_suggested_inventory() to authenticated;

revoke all on function public.set_resource_inventory(public.digital_resource_type, integer) from public;
grant execute on function public.set_resource_inventory(public.digital_resource_type, integer) to authenticated;

revoke all on function public.allocate_course_resources_from_inventory(bigint, public.digital_resource_type, integer) from public;
grant execute on function public.allocate_course_resources_from_inventory(bigint, public.digital_resource_type, integer) to authenticated;

revoke all on function public.assign_vps_credentials_and_queue_emails(bigint, text, integer) from public;
grant execute on function public.assign_vps_credentials_and_queue_emails(bigint, text, integer) to authenticated;

revoke all on function public.apply_baseline_grants_for_student(bigint, uuid) from public;
grant execute on function public.apply_baseline_grants_for_student(bigint, uuid) to authenticated;

revoke all on function public.distribute_course_resources_to_students(bigint, public.digital_resource_type) from public;
grant execute on function public.distribute_course_resources_to_students(bigint, public.digital_resource_type) to authenticated;

revoke all on function public.is_enrolled_in_course(bigint, uuid) from public;
grant execute on function public.is_enrolled_in_course(bigint, uuid) to authenticated;

revoke all on function public.request_course_resources(bigint, public.digital_resource_type, integer) from public;
grant execute on function public.request_course_resources(bigint, public.digital_resource_type, integer) to authenticated;

revoke all on function public.approve_course_resource_request(bigint) from public;
grant execute on function public.approve_course_resource_request(bigint) to authenticated;

revoke all on function public.reject_course_resource_request(bigint) from public;
grant execute on function public.reject_course_resource_request(bigint) to authenticated;

revoke all on function public.submit_homework(bigint, text, text) from public;
grant execute on function public.submit_homework(bigint, text, text) to authenticated;

revoke all on function public.simulate_token_usage(bigint, integer, text) from public;
grant execute on function public.simulate_token_usage(bigint, integer, text) to authenticated;

revoke all on function public.simulate_vps_validation(bigint, boolean, text) from public;
grant execute on function public.simulate_vps_validation(bigint, boolean, text) to authenticated;

revoke all on function public.seed_course_activities_defaults(bigint) from public;
grant execute on function public.seed_course_activities_defaults(bigint) to authenticated;

revoke all on function public.create_course_activity(bigint, text, text, integer) from public;
grant execute on function public.create_course_activity(bigint, text, text, integer) to authenticated;

revoke all on function public.consume_tokens_for_activity(bigint, bigint, text) from public;
grant execute on function public.consume_tokens_for_activity(bigint, bigint, text) to authenticated;

-- courses: visible to students (open enrollments + enrolled), teacher own, admin all
drop policy if exists "courses_select_teacher_or_admin" on public.courses;
drop policy if exists "courses_select_visible_to_users" on public.courses;
create policy "courses_select_visible_to_users"
on public.courses
for select
to authenticated
using (
  public.is_admin(auth.uid())
  or teacher_id = auth.uid()
  or enrollment_open = true
  or exists (
    select 1 from public.course_enrollments e
    where e.course_id = id
      and e.student_id = auth.uid()
  )
);

-- inventory: admin only
drop policy if exists "resource_inventory_admin_only" on public.resource_inventory;
create policy "resource_inventory_admin_only"
on public.resource_inventory
for select
to authenticated
using (public.is_admin(auth.uid()));

-- admin activities: admin only (UI can show count)
drop policy if exists "admin_activities_admin_only" on public.admin_activities;
create policy "admin_activities_admin_only"
on public.admin_activities
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- vps credentials: admin sees all; student sees own; teacher sees for own courses
drop policy if exists "vps_credentials_select_visible" on public.vps_credentials;
create policy "vps_credentials_select_visible"
on public.vps_credentials
for select
to authenticated
using (
  public.is_admin(auth.uid())
  or student_id = auth.uid()
  or exists (
    select 1 from public.courses c
    where c.id = course_id
      and c.teacher_id = auth.uid()
  )
);

-- email outbox: admin only (simulated mail distribution)
drop policy if exists "email_outbox_admin_only" on public.email_outbox;
create policy "email_outbox_admin_only"
on public.email_outbox
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

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

-- enrollments: student sees own; teacher/admin sees enrollments for their courses
drop policy if exists "course_enrollments_select_visible" on public.course_enrollments;
create policy "course_enrollments_select_visible"
on public.course_enrollments
for select
to authenticated
using (
  student_id = auth.uid()
  or public.is_admin(auth.uid())
);

-- materials: enrolled students + course teacher/admin can read; teacher/admin can manage
drop policy if exists "course_materials_select_enrolled" on public.course_materials;
create policy "course_materials_select_enrolled"
on public.course_materials
for select
to authenticated
using (
  public.is_admin(auth.uid())
  or exists (
    select 1 from public.courses c
    where c.id = course_id
      and c.teacher_id = auth.uid()
  )
  or public.is_enrolled_in_course(course_id, auth.uid())
);

drop policy if exists "course_materials_manage_teacher_admin" on public.course_materials;
create policy "course_materials_manage_teacher_admin"
on public.course_materials
for all
to authenticated
using (
  public.is_admin(auth.uid())
  or exists (
    select 1 from public.courses c
    where c.id = course_id
      and c.teacher_id = auth.uid()
  )
)
with check (
  public.is_admin(auth.uid())
  or exists (
    select 1 from public.courses c
    where c.id = course_id
      and c.teacher_id = auth.uid()
  )
);

-- student resources: student sees own; teacher/admin sees for their courses
drop policy if exists "course_student_resources_select_visible" on public.course_student_resources;
create policy "course_student_resources_select_visible"
on public.course_student_resources
for select
to authenticated
using (
  student_id = auth.uid()
  or public.is_admin(auth.uid())
  or exists (
    select 1 from public.courses c
    where c.id = course_id
      and c.teacher_id = auth.uid()
  )
);

-- resource requests: student manages own inserts/select; teacher/admin selects; teacher/admin can update (approve/reject via RPC)
drop policy if exists "course_resource_requests_select_visible" on public.course_resource_requests;
create policy "course_resource_requests_select_visible"
on public.course_resource_requests
for select
to authenticated
using (
  student_id = auth.uid()
  or public.is_admin(auth.uid())
  or exists (
    select 1 from public.courses c
    where c.id = course_id
      and c.teacher_id = auth.uid()
  )
);

drop policy if exists "course_resource_requests_insert_student" on public.course_resource_requests;
create policy "course_resource_requests_insert_student"
on public.course_resource_requests
for insert
to authenticated
with check (
  student_id = auth.uid()
  and public.is_enrolled_in_course(course_id, auth.uid())
);

drop policy if exists "course_resource_requests_update_teacher_admin" on public.course_resource_requests;
create policy "course_resource_requests_update_teacher_admin"
on public.course_resource_requests
for update
to authenticated
using (
  public.is_admin(auth.uid())
  or exists (
    select 1 from public.courses c
    where c.id = course_id
      and c.teacher_id = auth.uid()
  )
)
with check (
  public.is_admin(auth.uid())
  or exists (
    select 1 from public.courses c
    where c.id = course_id
      and c.teacher_id = auth.uid()
  )
);

-- homework: student sees/creates own; teacher/admin sees for their courses
drop policy if exists "course_homework_select_visible" on public.course_homework_submissions;
create policy "course_homework_select_visible"
on public.course_homework_submissions
for select
to authenticated
using (
  student_id = auth.uid()
  or public.is_admin(auth.uid())
  or exists (
    select 1 from public.courses c
    where c.id = course_id
      and c.teacher_id = auth.uid()
  )
);

drop policy if exists "course_homework_insert_student" on public.course_homework_submissions;
create policy "course_homework_insert_student"
on public.course_homework_submissions
for insert
to authenticated
with check (
  student_id = auth.uid()
  and public.is_enrolled_in_course(course_id, auth.uid())
);

-- token activities: student sees own; teacher/admin sees for their courses
drop policy if exists "course_token_activities_select_visible" on public.course_token_activities;
create policy "course_token_activities_select_visible"
on public.course_token_activities
for select
to authenticated
using (
  student_id = auth.uid()
  or public.is_admin(auth.uid())
  or exists (
    select 1 from public.courses c
    where c.id = course_id
      and c.teacher_id = auth.uid()
  )
);

-- vps validations: student sees own; teacher/admin sees for their courses
drop policy if exists "course_vps_validations_select_visible" on public.course_vps_validations;
create policy "course_vps_validations_select_visible"
on public.course_vps_validations
for select
to authenticated
using (
  student_id = auth.uid()
  or public.is_admin(auth.uid())
  or exists (
    select 1 from public.courses c
    where c.id = course_id
      and c.teacher_id = auth.uid()
  )
);

-- course activities: students enrolled + course teacher + admin can read; only admin can manage
drop policy if exists "course_activities_select_visible" on public.course_activities;
create policy "course_activities_select_visible"
on public.course_activities
for select
to authenticated
using (
  public.is_admin(auth.uid())
  or exists (
    select 1 from public.courses c
    where c.id = course_id
      and c.teacher_id = auth.uid()
  )
  or public.is_enrolled_in_course(course_id, auth.uid())
);

drop policy if exists "course_activities_admin_manage" on public.course_activities;
create policy "course_activities_admin_manage"
on public.course_activities
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
