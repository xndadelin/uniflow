

create table if not exists public.roles (
  id bigserial primary key,
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);


create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create table if not exists public.user_roles (
  user_id uuid not null references public.app_users(id) on delete cascade,
  role_id bigint not null references public.roles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.app_users(id) on delete set null,
  primary key (user_id, role_id)
);

create index if not exists user_roles_user_idx on public.user_roles(user_id);
create index if not exists user_roles_role_idx on public.user_roles(role_id);


create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;$$;

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();


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
end;$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();


insert into public.roles (name, description)
values
  ('student', 'Student user role'),
  ('profesor', 'Profesor/teacher role'),
  ('admin', 'Application administrator'),
  ('audit', 'Read-only auditor role')
on conflict (name) do nothing;


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
end;$$;

drop trigger if exists on_app_user_created_assign_role on public.app_users;
create trigger on_app_user_created_assign_role
after insert on public.app_users
for each row execute function public.assign_default_role();


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
  );$$;


alter table public.roles enable row level security;
alter table public.app_users enable row level security;
alter table public.user_roles enable row level security;


revoke all on public.roles from anon, authenticated;
revoke all on public.app_users from anon, authenticated;
revoke all on public.user_roles from anon, authenticated;


grant select on public.roles to authenticated;
grant select, update on public.app_users to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;


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


drop policy if exists "app_users_select_self_or_admin" on public.app_users;
create policy "app_users_select_self_or_admin"
on public.app_users
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists "app_users_select_teacher_for_course_students" on public.app_users;
create policy "app_users_select_teacher_for_course_students"
on public.app_users
for select
to authenticated
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.courses c
    join public.course_enrollments e on e.course_id = c.id
    where c.teacher_id = auth.uid()
      and e.student_id = public.app_users.id
  )
  or exists (
    select 1
    from public.courses c
    join public.course_homework_submissions_v2 s on s.course_id = c.id
    where c.teacher_id = auth.uid()
      and s.student_id = public.app_users.id
  )
);

drop policy if exists "app_users_select_audit" on public.app_users;
create policy "app_users_select_audit"
on public.app_users
for select
to authenticated
using (
  public.is_admin(auth.uid())
  or public.is_audit(auth.uid())
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
end;$$;

drop trigger if exists user_roles_protect_last_admin_delete on public.user_roles;
create trigger user_roles_protect_last_admin_delete
before delete on public.user_roles
for each row execute function public.prevent_last_admin_role_removal();

drop trigger if exists user_roles_protect_last_admin_update on public.user_roles;
create trigger user_roles_protect_last_admin_update
before update on public.user_roles
for each row execute function public.prevent_last_admin_role_removal();


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
  );$$;


create or replace function public.is_audit(_user_id uuid default auth.uid())
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
      and r.name = 'audit'
  );$$;


create table if not exists public.audit_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor_id uuid references public.app_users(id) on delete set null,
  action text not null,
  entity_table text,
  entity_id text,
  course_id bigint,
  message text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id);
create index if not exists audit_logs_course_idx on public.audit_logs(course_id);

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

drop policy if exists "audit_logs_select_audit_or_admin" on public.audit_logs;
create policy "audit_logs_select_audit_or_admin"
on public.audit_logs
for select
to authenticated
using (
  public.is_admin(auth.uid())
  or public.is_audit(auth.uid())
);


create or replace function public.audit_log(
  _action text,
  _entity_table text default null,
  _entity_id text default null,
  _course_id bigint default null,
  _message text default null,
  _metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_headers jsonb;
  v_method text;
  v_path text;
  v_request jsonb;
begin
  v_headers := null;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;

  v_method := nullif(current_setting('request.method', true), '');
  v_path := nullif(current_setting('request.path', true), '');

  v_request := jsonb_strip_nulls(
    jsonb_build_object(
      'method', v_method,
      'path', v_path,
      'headers', v_headers
    )
  );

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, course_id, message, metadata)
  values (
    auth.uid(),
    _action,
    _entity_table,
    _entity_id,
    _course_id,
    _message,
    coalesce(_metadata, '{}'::jsonb) ||
      case when v_request <> '{}'::jsonb then jsonb_build_object('request', v_request) else '{}'::jsonb end
  );
end;$$;

create or replace function public.trg_audit_user_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_log(
      'role_assigned',
      'user_roles',
      new.user_id::text || ':' || new.role_id::text,
      null,
      null,
      jsonb_build_object('user_id', new.user_id, 'role_id', new.role_id, 'assigned_by', new.assigned_by)
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.audit_log(
      'role_revoked',
      'user_roles',
      old.user_id::text || ':' || old.role_id::text,
      null,
      null,
      jsonb_build_object('user_id', old.user_id, 'role_id', old.role_id)
    );
    return old;
  end if;

  return coalesce(new, old);
end;$$;

drop trigger if exists audit_user_roles_ins on public.user_roles;
create trigger audit_user_roles_ins
after insert on public.user_roles
for each row execute function public.trg_audit_user_roles();

drop trigger if exists audit_user_roles_del on public.user_roles;
create trigger audit_user_roles_del
after delete on public.user_roles
for each row execute function public.trg_audit_user_roles();

create or replace function public.trg_audit_course_resource_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'resource_request_created';
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      v_action := 'resource_request_status_changed';
    else
      return new;
    end if;
  else
    return coalesce(new, old);
  end if;

  perform public.audit_log(
    v_action,
    'course_resource_requests',
    (coalesce(new.id, old.id))::text,
    coalesce(new.course_id, old.course_id),
    null,
    jsonb_build_object(
      'old_status', old.status,
      'new_status', new.status,
      'resource_type', coalesce(new.resource_type, old.resource_type),
      'requested_amount', coalesce(new.requested_amount, old.requested_amount),
      'student_id', coalesce(new.student_id, old.student_id)
    )
  );

  return new;
end;$$;

drop trigger if exists audit_course_resource_requests_ins on public.course_resource_requests;
create trigger audit_course_resource_requests_ins
after insert on public.course_resource_requests
for each row execute function public.trg_audit_course_resource_requests();

drop trigger if exists audit_course_resource_requests_upd on public.course_resource_requests;
create trigger audit_course_resource_requests_upd
after update on public.course_resource_requests
for each row execute function public.trg_audit_course_resource_requests();

create or replace function public.trg_audit_course_materials()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_log(
      'course_material_created',
      'course_materials',
      new.id::text,
      new.course_id,
      new.title,
      jsonb_build_object('url', new.url)
    );
    return new;
  end if;
  return coalesce(new, old);
end;$$;

drop trigger if exists audit_course_materials_ins on public.course_materials;
create trigger audit_course_materials_ins
after insert on public.course_materials
for each row execute function public.trg_audit_course_materials();

create or replace function public.trg_audit_homework_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_log(
      'homework_assignment_created',
      'course_homework_assignments',
      new.id::text,
      new.course_id,
      new.title,
      jsonb_build_object('due_at', new.due_at)
    );
    return new;
  end if;
  return coalesce(new, old);
end;$$;

drop trigger if exists audit_course_homework_assignments_ins on public.course_homework_assignments;
create trigger audit_course_homework_assignments_ins
after insert on public.course_homework_assignments
for each row execute function public.trg_audit_homework_assignments();

create or replace function public.trg_audit_homework_submissions_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'homework_submitted';
  elsif tg_op = 'UPDATE' then
    v_action := 'homework_resubmitted';
  else
    return coalesce(new, old);
  end if;

  perform public.audit_log(
    v_action,
    'course_homework_submissions_v2',
    (coalesce(new.id, old.id))::text,
    coalesce(new.course_id, old.course_id),
    null,
    jsonb_build_object(
      'assignment_id', coalesce(new.assignment_id, old.assignment_id),
      'student_id', coalesce(new.student_id, old.student_id),
      'link_url', coalesce(new.link_url, old.link_url)
    )
  );

  return new;
end;$$;

drop trigger if exists audit_course_homework_submissions_v2_ins on public.course_homework_submissions_v2;
create trigger audit_course_homework_submissions_v2_ins
after insert on public.course_homework_submissions_v2
for each row execute function public.trg_audit_homework_submissions_v2();

drop trigger if exists audit_course_homework_submissions_v2_upd on public.course_homework_submissions_v2;
create trigger audit_course_homework_submissions_v2_upd
after update on public.course_homework_submissions_v2
for each row execute function public.trg_audit_homework_submissions_v2();


create or replace function public.trg_audit_generic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id text;
  v_course_id bigint;
  v_action text;
  v_new jsonb;
  v_old jsonb;
  v_key text;
  v_changed_keys text[];
  v_changes jsonb := '{}'::jsonb;
  v_pk_cols text[];
  v_pk jsonb := '{}'::jsonb;
begin
  v_action := lower(tg_table_name) || '_' || lower(tg_op);
  v_new := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  v_old := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;

  if tg_op = 'UPDATE' and v_new = v_old then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_changed_keys := array[]::text[];
    for v_key in
      select key
      from (
        select jsonb_object_keys(coalesce(v_old, '{}'::jsonb)) as key
        union
        select jsonb_object_keys(coalesce(v_new, '{}'::jsonb)) as key
      ) k
    loop
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changed_keys := array_append(v_changed_keys, v_key);
        v_changes :=
          v_changes ||
          jsonb_build_object(
            v_key,
            jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key)
          );
      end if;
    end loop;

    v_changed_keys := array_remove(v_changed_keys, 'updated_at');
    v_changed_keys := array_remove(v_changed_keys, 'allocated_at');
    v_changed_keys := array_remove(v_changed_keys, 'created_at');

    if array_length(v_changed_keys, 1) is null or array_length(v_changed_keys, 1) = 0 then
      return new;
    end if;
  end if;

  v_entity_id := coalesce((v_new ->> 'id'), (v_old ->> 'id'), null);

  if v_entity_id is null then
    select array_agg(a.attname order by x.ord) into v_pk_cols
    from (
      select unnest(i.indkey) as attnum, generate_subscripts(i.indkey, 1) as ord
      from pg_index i
      where i.indrelid = tg_relid
        and i.indisprimary
      limit 1
    ) x
    join pg_attribute a
      on a.attrelid = tg_relid
     and a.attnum = x.attnum
    where a.attnum > 0
      and not a.attisdropped;

    if v_pk_cols is not null and array_length(v_pk_cols, 1) > 0 then
      foreach v_key in array v_pk_cols loop
        v_pk := v_pk || jsonb_build_object(v_key, coalesce(v_new ->> v_key, v_old ->> v_key));
      end loop;

      if array_length(v_pk_cols, 1) = 1 then
        v_entity_id := v_pk ->> v_pk_cols[1];
      else
        v_entity_id := v_pk::text;
      end if;
    end if;
  end if;

  v_course_id := nullif(coalesce((v_new ->> 'course_id'), (v_old ->> 'course_id')), '')::bigint;

  perform public.audit_log(
    v_action,
    tg_table_name,
    v_entity_id,
    v_course_id,
    null,
    jsonb_build_object(
      'op', tg_op,
      'table', tg_table_name,
      'old', v_old,
      'new', v_new,
      'changed_keys', coalesce(v_changed_keys, array[]::text[]),
      'changes', v_changes
    )
  );

  return coalesce(new, old);
end;$$;


drop trigger if exists audit_roles_all on public.roles;
create trigger audit_roles_all
after insert or update or delete on public.roles
for each row execute function public.trg_audit_generic();

drop trigger if exists audit_app_users_all on public.app_users;
create trigger audit_app_users_all
after insert or update or delete on public.app_users
for each row execute function public.trg_audit_generic();


drop trigger if exists audit_user_roles_upd_generic on public.user_roles;
create trigger audit_user_roles_upd_generic
after update on public.user_roles
for each row execute function public.trg_audit_generic();

drop trigger if exists audit_resource_inventory_all on public.resource_inventory;
create trigger audit_resource_inventory_all
after insert or update or delete on public.resource_inventory
for each row execute function public.trg_audit_generic();

drop trigger if exists audit_admin_activities_all on public.admin_activities;
create trigger audit_admin_activities_all
after insert or update or delete on public.admin_activities
for each row execute function public.trg_audit_generic();

drop trigger if exists audit_course_activities_all on public.course_activities;
create trigger audit_course_activities_all
after insert or update or delete on public.course_activities
for each row execute function public.trg_audit_generic();

drop trigger if exists audit_vps_credentials_all on public.vps_credentials;
create trigger audit_vps_credentials_all
after insert or update or delete on public.vps_credentials
for each row execute function public.trg_audit_generic();

drop trigger if exists audit_email_outbox_all on public.email_outbox;
create trigger audit_email_outbox_all
after insert or update or delete on public.email_outbox
for each row execute function public.trg_audit_generic();

drop trigger if exists audit_vps_email_validation_tokens_all on public.vps_email_validation_tokens;
create trigger audit_vps_email_validation_tokens_all
after insert or update or delete on public.vps_email_validation_tokens
for each row execute function public.trg_audit_generic();

drop trigger if exists audit_courses_all on public.courses;
create trigger audit_courses_all
after insert or update or delete on public.courses
for each row execute function public.trg_audit_generic();

drop trigger if exists audit_course_resource_requirements_all on public.course_resource_requirements;
create trigger audit_course_resource_requirements_all
after insert or update or delete on public.course_resource_requirements
for each row execute function public.trg_audit_generic();

drop trigger if exists audit_course_enrollments_all on public.course_enrollments;
create trigger audit_course_enrollments_all
after insert or update or delete on public.course_enrollments
for each row execute function public.trg_audit_generic();


drop trigger if exists audit_course_materials_upd_del_generic on public.course_materials;
create trigger audit_course_materials_upd_del_generic
after update or delete on public.course_materials
for each row execute function public.trg_audit_generic();

drop trigger if exists audit_course_student_resources_all on public.course_student_resources;
create trigger audit_course_student_resources_all
after insert or update or delete on public.course_student_resources
for each row execute function public.trg_audit_generic();


drop trigger if exists audit_course_resource_requests_del_generic on public.course_resource_requests;
create trigger audit_course_resource_requests_del_generic
after delete on public.course_resource_requests
for each row execute function public.trg_audit_generic();

drop trigger if exists audit_course_homework_submissions_all on public.course_homework_submissions;
create trigger audit_course_homework_submissions_all
after insert or update or delete on public.course_homework_submissions
for each row execute function public.trg_audit_generic();


drop trigger if exists audit_course_homework_assignments_upd_del_generic on public.course_homework_assignments;
create trigger audit_course_homework_assignments_upd_del_generic
after update or delete on public.course_homework_assignments
for each row execute function public.trg_audit_generic();

drop trigger if exists audit_course_homework_assignment_files_all on public.course_homework_assignment_files;
create trigger audit_course_homework_assignment_files_all
after insert or update or delete on public.course_homework_assignment_files
for each row execute function public.trg_audit_generic();


drop trigger if exists audit_course_homework_submissions_v2_del_generic on public.course_homework_submissions_v2;
create trigger audit_course_homework_submissions_v2_del_generic
after delete on public.course_homework_submissions_v2
for each row execute function public.trg_audit_generic();

drop trigger if exists audit_course_homework_submission_files_all on public.course_homework_submission_files;
create trigger audit_course_homework_submission_files_all
after insert or update or delete on public.course_homework_submission_files
for each row execute function public.trg_audit_generic();

drop trigger if exists audit_course_token_activities_all on public.course_token_activities;
create trigger audit_course_token_activities_all
after insert or update or delete on public.course_token_activities
for each row execute function public.trg_audit_generic();

drop trigger if exists audit_course_vps_validations_all on public.course_vps_validations;
create trigger audit_course_vps_validations_all
after insert or update or delete on public.course_vps_validations
for each row execute function public.trg_audit_generic();

drop trigger if exists audit_course_resource_allocations_all on public.course_resource_allocations;
create trigger audit_course_resource_allocations_all
after insert or update or delete on public.course_resource_allocations
for each row execute function public.trg_audit_generic();


do $$
begin
  if not exists (select 1 from pg_type where typname = 'digital_resource_type') then
    create type public.digital_resource_type as enum ('tokens', 'vps_subscription');
  end if;
end$$;


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


insert into public.resource_inventory (resource_type, total_amount, remaining_amount)
values ('tokens', 0, 0), ('vps_subscription', 0, 0)
on conflict (resource_type) do nothing;


create table if not exists public.admin_activities (
  id bigserial primary key,
  title text not null,
  description text,
  token_cost integer not null default 0 check (token_cost >= 0),
  created_at timestamptz not null default now()
);


create unique index if not exists admin_activities_title_uidx on public.admin_activities (title);


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
    token_cost = excluded.token_cost
where public.admin_activities.description is distinct from excluded.description
   or public.admin_activities.token_cost is distinct from excluded.token_cost;


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
      token_cost = excluded.token_cost
  where public.course_activities.description is distinct from excluded.description
     or public.course_activities.token_cost is distinct from excluded.token_cost;
end;$$;


create or replace function public.handle_new_course_seed_activities()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

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
      token_cost = excluded.token_cost
  where public.course_activities.description is distinct from excluded.description
     or public.course_activities.token_cost is distinct from excluded.token_cost;

  return new;
end;$$;

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
      token_cost = excluded.token_cost
  where public.course_activities.description is distinct from excluded.description
     or public.course_activities.token_cost is distinct from excluded.token_cost;
end;$$;


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
end;$$;


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
      token_cost = excluded.token_cost
  where public.admin_activities.description is distinct from excluded.description
     or public.admin_activities.token_cost is distinct from excluded.token_cost;
end;$$;


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
end;$$;


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
  order by r.resource_type;$$;


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


create table if not exists public.email_outbox (
  id bigserial primary key,
  to_email text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);


create table if not exists public.vps_email_validation_tokens (
  token uuid primary key default gen_random_uuid(),
  course_id bigint not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz
);

create index if not exists vps_email_validation_tokens_course_idx on public.vps_email_validation_tokens(course_id);
create index if not exists vps_email_validation_tokens_student_idx on public.vps_email_validation_tokens(student_id);


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
      updated_at = now()
  where public.resource_inventory.total_amount is distinct from excluded.total_amount
     or public.resource_inventory.remaining_amount is distinct from excluded.remaining_amount;
end;$$;


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
end;$$;


create or replace function public.assign_vps_credentials_and_queue_emails(
  _course_id bigint,
  _default_host text,
  _default_port integer default 22,
  _app_base_url text default ''
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
  v_token uuid;
  v_course_title text;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Doar admin poate distribui credentiale.';
  end if;

  select title into v_course_title
  from public.courses
  where id = _course_id;

  for r in
    select e.student_id, u.email
    from public.course_enrollments e
    join public.app_users u on u.id = e.student_id
    where e.course_id = _course_id
  loop

    v_username := 'student_' || left(r.student_id::text, 8);
    v_password := left(md5(r.student_id::text), 12);

    insert into public.vps_credentials (course_id, student_id, username, password, host, port)
    values (_course_id, r.student_id, v_username, v_password, _default_host, _default_port)
    on conflict (course_id, student_id) do update
    set host = excluded.host,
        port = excluded.port;

    insert into public.vps_email_validation_tokens (course_id, student_id)
    values (_course_id, r.student_id)
    returning token into v_token;

    insert into public.email_outbox (to_email, subject, body)
    values (
      r.email,
      'Credențiale VPS - UniFlow',
      'Curs #' || _course_id || ': ' || coalesce(v_course_title, '-') || E'\n' ||
      'Host/IP: ' || _default_host || E'\n' ||
      'Port: ' || _default_port || E'\n' ||
      'User: ' || v_username || E'\n' ||
      'Parola: ' || v_password || E'\n' ||
      E'\n' ||
      'Validare utilizare (simulata):' || E'\n' ||
      'Click aici pentru validare (consuma 1 abonament):' || E'\n' ||
      rtrim(coalesce(nullif(trim(_app_base_url), ''), ''), '/') || '/api/vps/validate?token=' || v_token || E'\n' ||
      E'\n' ||
      'Nota: In platforma, sectiunea VPS poate rula validarea automat si consuma 1 abonament.'
    );
  end loop;
end;$$;

create or replace function public.consume_vps_validation_from_token(
  _token uuid,
  _is_valid boolean,
  _note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id bigint;
  v_student_id uuid;
  v_used timestamptz;
  v_expires timestamptz;
  v_granted integer;
  v_consumed integer;
  v_remaining integer;
begin
  select course_id, student_id, used_at, expires_at
  into v_course_id, v_student_id, v_used, v_expires
  from public.vps_email_validation_tokens
  where token = _token;

  if v_course_id is null then
    raise exception 'Token invalid.';
  end if;

  if v_used is not null then
    raise exception 'Token deja folosit.';
  end if;

  if v_expires is not null and v_expires < now() then
    raise exception 'Token expirat.';
  end if;

  if not public.is_enrolled_in_course(v_course_id, v_student_id) then
    raise exception 'Studentul nu este inrolat.';
  end if;

  select granted_amount, consumed_amount into v_granted, v_consumed
  from public.course_student_resources
  where course_id = v_course_id
    and student_id = v_student_id
    and resource_type = 'vps_subscription';

  v_granted := coalesce(v_granted, 0);
  v_consumed := coalesce(v_consumed, 0);
  v_remaining := greatest(v_granted - v_consumed, 0);

  if v_remaining < 1 then
    raise exception 'Abonamente VPS insuficiente.';
  end if;

  insert into public.course_vps_validations (course_id, student_id, is_valid, note)
  values (v_course_id, v_student_id, coalesce(_is_valid, false), _note);

  update public.course_student_resources
  set consumed_amount = consumed_amount + 1
  where course_id = v_course_id
    and student_id = v_student_id
    and resource_type = 'vps_subscription';

  update public.vps_email_validation_tokens
  set used_at = now()
  where token = _token;
end;$$;


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


alter table public.courses
  add column if not exists enrollment_open boolean not null default true;

drop trigger if exists courses_set_updated_at on public.courses;
create trigger courses_set_updated_at
before update on public.courses
for each row execute function public.set_updated_at();


create table if not exists public.course_resource_requirements (
  id bigserial primary key,
  course_id bigint not null references public.courses(id) on delete cascade,
  resource_type public.digital_resource_type not null,


  required_per_student integer not null default 0 check (required_per_student >= 0),
  required_amount integer not null check (required_amount >= 0),
  created_at timestamptz not null default now(),
  unique (course_id, resource_type)
);

create index if not exists course_requirements_course_idx on public.course_resource_requirements(course_id);


alter table public.course_resource_requirements
  add column if not exists required_per_student integer not null default 0;


create table if not exists public.course_enrollments (
  course_id bigint not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.app_users(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  primary key (course_id, student_id)
);

create index if not exists course_enrollments_student_idx on public.course_enrollments(student_id);


create or replace function public.handle_new_course_enrollment_apply_baseline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_baseline_grants_for_student(new.course_id, new.student_id);
  return new;
end;$$;

drop trigger if exists on_course_enrollment_created_apply_baseline on public.course_enrollments;
create trigger on_course_enrollment_created_apply_baseline
after insert on public.course_enrollments
for each row execute function public.handle_new_course_enrollment_apply_baseline();


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


do $$
begin
  if not exists (select 1 from pg_type where typname = 'course_resource_request_status') then
    create type public.course_resource_request_status as enum ('pending', 'approved', 'rejected');
  else

    begin
      alter type public.course_resource_request_status add value if not exists 'escalated';
    exception when others then

      null;
    end;
  end if;
end$$;

create table if not exists public.course_resource_requests (
  id bigserial primary key,
  course_id bigint not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.app_users(id) on delete cascade,
  resource_type public.digital_resource_type not null,
  requested_amount integer not null check (requested_amount > 0),
  status public.course_resource_request_status not null default 'pending',
  decided_by uuid references public.app_users(id) on delete set null,
  decided_at timestamptz,
  escalated_by uuid references public.app_users(id) on delete set null,
  escalated_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.course_resource_requests
  add column if not exists escalated_by uuid references public.app_users(id) on delete set null;
alter table public.course_resource_requests
  add column if not exists escalated_at timestamptz;

create index if not exists course_resource_requests_course_idx on public.course_resource_requests(course_id);
create index if not exists course_resource_requests_student_idx on public.course_resource_requests(student_id);


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


create table if not exists public.course_homework_assignments (
  id bigserial primary key,
  course_id bigint not null references public.courses(id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists course_homework_assignments_course_idx on public.course_homework_assignments(course_id);

create table if not exists public.course_homework_assignment_files (
  id bigserial primary key,
  assignment_id bigint not null references public.course_homework_assignments(id) on delete cascade,
  title text,
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists course_homework_assignment_files_assignment_idx on public.course_homework_assignment_files(assignment_id);

create table if not exists public.course_homework_submissions_v2 (
  id bigserial primary key,
  assignment_id bigint not null references public.course_homework_assignments(id) on delete cascade,
  course_id bigint not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.app_users(id) on delete cascade,
  link_url text,
  created_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create index if not exists course_homework_submissions_v2_course_idx on public.course_homework_submissions_v2(course_id);
create index if not exists course_homework_submissions_v2_student_idx on public.course_homework_submissions_v2(student_id);

create table if not exists public.course_homework_submission_files (
  id bigserial primary key,
  submission_id bigint not null references public.course_homework_submissions_v2(id) on delete cascade,
  title text,
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists course_homework_submission_files_submission_idx on public.course_homework_submission_files(submission_id);


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
  );$$;


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
end;$$;


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
    raise exception 'Bonus insuficient pentru aprobare. Trimite cererea la admin.';
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
end;$$;


create or replace function public.escalate_course_resource_request(_request_id bigint)
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

  if v_teacher_id <> auth.uid() and not public.is_admin(auth.uid()) then
    raise exception 'Doar profesorul cursului sau admin poate escalada.';
  end if;

  update public.course_resource_requests
  set status = 'escalated',
      escalated_by = auth.uid(),
      escalated_at = now()
  where id = _request_id;
end;$$;


create or replace function public.admin_approve_escalated_course_resource_request(_request_id bigint)
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
  inv_remaining integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Doar admin poate aproba escalari.';
  end if;

  select r.course_id, r.student_id, r.resource_type, r.requested_amount
  into v_course_id, v_student_id, v_type, v_amount
  from public.course_resource_requests r
  where r.id = _request_id
    and r.status = 'escalated';

  if v_course_id is null then
    raise exception 'Cerere inexistenta sau nu este escaladata.';
  end if;

  select remaining_amount into inv_remaining
  from public.resource_inventory
  where resource_type = v_type;

  if inv_remaining is null then
    raise exception 'Inventar inexistent pentru acest tip.';
  end if;

  if inv_remaining < greatest(v_amount, 0) then
    raise exception 'Inventar insuficient: ramas %, cerut %.', inv_remaining, greatest(v_amount, 0);
  end if;

  update public.resource_inventory
  set remaining_amount = remaining_amount - greatest(v_amount, 0)
  where resource_type = v_type;

  insert into public.course_student_resources (course_id, student_id, resource_type, granted_amount, consumed_amount)
  values (v_course_id, v_student_id, v_type, v_amount, 0)
  on conflict (course_id, student_id, resource_type) do update
  set granted_amount = public.course_student_resources.granted_amount + excluded.granted_amount;

  update public.course_resource_requests
  set status = 'approved',
      decided_by = auth.uid(),
      decided_at = now()
  where id = _request_id;
end;$$;


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
end;$$;


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
end;$$;


create or replace function public.create_homework_assignment(
  _course_id bigint,
  _title text,
  _description text default null,
  _due_at timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id uuid;
  v_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Trebuie sa fii autentificat.';
  end if;

  select c.teacher_id into v_teacher_id
  from public.courses c
  where c.id = _course_id;

  if v_teacher_id is null then
    raise exception 'Curs inexistent.';
  end if;

  if not (public.is_admin(auth.uid()) or v_teacher_id = auth.uid()) then
    raise exception 'Doar profesorul cursului sau admin poate crea teme.';
  end if;

  if _title is null or length(trim(_title)) = 0 then
    raise exception 'Titlu invalid.';
  end if;

  insert into public.course_homework_assignments (course_id, title, description, due_at, created_by)
  values (_course_id, trim(_title), nullif(trim(_description), ''), _due_at, auth.uid())
  returning id into v_id;

  return v_id;
end;$$;


create or replace function public.submit_homework_assignment(
  _assignment_id bigint,
  _link_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Trebuie sa fii autentificat.';
  end if;

  select a.course_id into v_course_id
  from public.course_homework_assignments a
  where a.id = _assignment_id;

  if v_course_id is null then
    raise exception 'Tema inexistenta.';
  end if;

  if not public.is_enrolled_in_course(v_course_id, auth.uid()) then
    raise exception 'Nu esti inrolat la acest curs.';
  end if;

  insert into public.course_homework_submissions_v2 (assignment_id, course_id, student_id, link_url)
  values (_assignment_id, v_course_id, auth.uid(), nullif(trim(_link_url), ''))
  on conflict (assignment_id, student_id) do update
  set link_url = excluded.link_url,
      created_at = now()
  where public.course_homework_submissions_v2.link_url is distinct from excluded.link_url;
end;$$;


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
end;$$;


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
end;$$;


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


  perform public.apply_baseline_grants_for_student(_course_id, auth.uid());
end;$$;


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


  select
    coalesce((r.required_per_student * c.max_students), r.required_amount) into req
  from public.course_resource_requirements r
  join public.courses c on c.id = r.course_id
  where r.course_id = _course_id
    and r.resource_type = _resource_type;

  if req is null then
    raise exception 'Nu exista cerinta de resurse pentru acest tip.';
  end if;


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
      allocated_at = now()
  where public.course_resource_allocations.allocated_amount is distinct from excluded.allocated_amount
     or public.course_resource_allocations.professor_bonus_amount is distinct from excluded.professor_bonus_amount
     or public.course_resource_allocations.allocated_by is distinct from excluded.allocated_by;


  perform public.distribute_course_resources_to_students(_course_id, _resource_type);
end;$$;


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
end;$$;


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

    grant_per_student := least(greatest(per_student, 0), floor((greatest(allocated, 0)::numeric) / enrolled_count)::int);
  end if;


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
end;$$;


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
alter table public.vps_email_validation_tokens enable row level security;

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
revoke all on public.vps_email_validation_tokens from anon, authenticated;

grant select, insert, update, delete on public.courses to authenticated;
grant select on public.resource_inventory to authenticated;
grant select on public.admin_activities to authenticated;
grant select on public.vps_credentials to authenticated;
grant select, update on public.email_outbox to authenticated;
grant select, insert, update, delete on public.course_resource_requirements to authenticated;
grant select on public.course_enrollments to authenticated;
grant select, insert, update, delete on public.course_materials to authenticated;
grant select on public.course_student_resources to authenticated;
grant select, insert on public.course_resource_requests to authenticated;
grant select, insert on public.course_homework_submissions to authenticated;
grant select on public.course_token_activities to authenticated;
grant select on public.course_vps_validations to authenticated;
grant select on public.course_resource_allocations to authenticated;
grant select on public.course_activities to authenticated;
grant select on public.vps_email_validation_tokens to authenticated;


grant usage, select on sequence public.course_materials_id_seq to authenticated;

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

revoke all on function public.assign_vps_credentials_and_queue_emails(bigint, text, integer, text) from public;
grant execute on function public.assign_vps_credentials_and_queue_emails(bigint, text, integer, text) to authenticated;

revoke all on function public.consume_vps_validation_from_token(uuid, boolean, text) from public;
grant execute on function public.consume_vps_validation_from_token(uuid, boolean, text) to authenticated;

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

revoke all on function public.escalate_course_resource_request(bigint) from public;
grant execute on function public.escalate_course_resource_request(bigint) to authenticated;

revoke all on function public.admin_approve_escalated_course_resource_request(bigint) from public;
grant execute on function public.admin_approve_escalated_course_resource_request(bigint) to authenticated;

revoke all on function public.submit_homework(bigint, text, text) from public;
grant execute on function public.submit_homework(bigint, text, text) to authenticated;

revoke all on function public.create_homework_assignment(bigint, text, text, timestamptz) from public;
grant execute on function public.create_homework_assignment(bigint, text, text, timestamptz) to authenticated;

revoke all on function public.submit_homework_assignment(bigint, text) from public;
grant execute on function public.submit_homework_assignment(bigint, text) to authenticated;

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


drop policy if exists "resource_inventory_admin_only" on public.resource_inventory;
create policy "resource_inventory_admin_only"
on public.resource_inventory
for select
to authenticated
using (public.is_admin(auth.uid()));


drop policy if exists "admin_activities_admin_only" on public.admin_activities;
create policy "admin_activities_admin_only"
on public.admin_activities
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));


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


drop policy if exists "email_outbox_admin_only" on public.email_outbox;
create policy "email_outbox_admin_only"
on public.email_outbox
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));


drop policy if exists "vps_email_validation_tokens_admin_only" on public.vps_email_validation_tokens;
create policy "vps_email_validation_tokens_admin_only"
on public.vps_email_validation_tokens
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


drop policy if exists "course_enrollments_select_visible" on public.course_enrollments;
create policy "course_enrollments_select_visible"
on public.course_enrollments
for select
to authenticated
using (
  student_id = auth.uid()
  or public.is_admin(auth.uid())
);


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


alter table public.course_homework_assignments enable row level security;
alter table public.course_homework_assignment_files enable row level security;
alter table public.course_homework_submissions_v2 enable row level security;
alter table public.course_homework_submission_files enable row level security;


drop policy if exists "course_hw_assignments_select_visible" on public.course_homework_assignments;
create policy "course_hw_assignments_select_visible"
on public.course_homework_assignments
for select
to authenticated
using (
  public.is_admin(auth.uid())
  or exists (select 1 from public.courses c where c.id = course_id and c.teacher_id = auth.uid())
  or public.is_enrolled_in_course(course_id, auth.uid())
);

drop policy if exists "course_hw_assignments_insert_teacher_admin" on public.course_homework_assignments;
create policy "course_hw_assignments_insert_teacher_admin"
on public.course_homework_assignments
for insert
to authenticated
with check (
  public.is_admin(auth.uid())
  or exists (select 1 from public.courses c where c.id = course_id and c.teacher_id = auth.uid())
);

drop policy if exists "course_hw_assignments_update_teacher_admin" on public.course_homework_assignments;
create policy "course_hw_assignments_update_teacher_admin"
on public.course_homework_assignments
for update
to authenticated
using (
  public.is_admin(auth.uid())
  or exists (select 1 from public.courses c where c.id = course_id and c.teacher_id = auth.uid())
)
with check (
  public.is_admin(auth.uid())
  or exists (select 1 from public.courses c where c.id = course_id and c.teacher_id = auth.uid())
);

drop policy if exists "course_hw_assignments_delete_teacher_admin" on public.course_homework_assignments;
create policy "course_hw_assignments_delete_teacher_admin"
on public.course_homework_assignments
for delete
to authenticated
using (
  public.is_admin(auth.uid())
  or exists (select 1 from public.courses c where c.id = course_id and c.teacher_id = auth.uid())
);


drop policy if exists "course_hw_assignment_files_select_visible" on public.course_homework_assignment_files;
create policy "course_hw_assignment_files_select_visible"
on public.course_homework_assignment_files
for select
to authenticated
using (
  exists (
    select 1
    from public.course_homework_assignments a
    where a.id = assignment_id
      and (
        public.is_admin(auth.uid())
        or exists (select 1 from public.courses c where c.id = a.course_id and c.teacher_id = auth.uid())
        or public.is_enrolled_in_course(a.course_id, auth.uid())
      )
  )
);

drop policy if exists "course_hw_assignment_files_insert_teacher_admin" on public.course_homework_assignment_files;
create policy "course_hw_assignment_files_insert_teacher_admin"
on public.course_homework_assignment_files
for insert
to authenticated
with check (
  exists (
    select 1
    from public.course_homework_assignments a
    where a.id = assignment_id
      and (
        public.is_admin(auth.uid())
        or exists (select 1 from public.courses c where c.id = a.course_id and c.teacher_id = auth.uid())
      )
  )
);

drop policy if exists "course_hw_assignment_files_delete_teacher_admin" on public.course_homework_assignment_files;
create policy "course_hw_assignment_files_delete_teacher_admin"
on public.course_homework_assignment_files
for delete
to authenticated
using (
  exists (
    select 1
    from public.course_homework_assignments a
    where a.id = assignment_id
      and (
        public.is_admin(auth.uid())
        or exists (select 1 from public.courses c where c.id = a.course_id and c.teacher_id = auth.uid())
      )
  )
);


drop policy if exists "course_hw_submissions_v2_select_visible" on public.course_homework_submissions_v2;
create policy "course_hw_submissions_v2_select_visible"
on public.course_homework_submissions_v2
for select
to authenticated
using (
  student_id = auth.uid()
  or public.is_admin(auth.uid())
  or exists (select 1 from public.courses c where c.id = course_id and c.teacher_id = auth.uid())
);

drop policy if exists "course_hw_submissions_v2_insert_student" on public.course_homework_submissions_v2;
create policy "course_hw_submissions_v2_insert_student"
on public.course_homework_submissions_v2
for insert
to authenticated
with check (
  student_id = auth.uid()
  and public.is_enrolled_in_course(course_id, auth.uid())
);

drop policy if exists "course_hw_submissions_v2_update_student" on public.course_homework_submissions_v2;
create policy "course_hw_submissions_v2_update_student"
on public.course_homework_submissions_v2
for update
to authenticated
using (student_id = auth.uid())
with check (student_id = auth.uid());


drop policy if exists "course_hw_submission_files_select_visible" on public.course_homework_submission_files;
create policy "course_hw_submission_files_select_visible"
on public.course_homework_submission_files
for select
to authenticated
using (
  exists (
    select 1
    from public.course_homework_submissions_v2 s
    where s.id = submission_id
      and (
        s.student_id = auth.uid()
        or public.is_admin(auth.uid())
        or exists (select 1 from public.courses c where c.id = s.course_id and c.teacher_id = auth.uid())
      )
  )
);

drop policy if exists "course_hw_submission_files_insert_owner" on public.course_homework_submission_files;
create policy "course_hw_submission_files_insert_owner"
on public.course_homework_submission_files
for insert
to authenticated
with check (
  exists (
    select 1 from public.course_homework_submissions_v2 s
    where s.id = submission_id
      and s.student_id = auth.uid()
  )
);

drop policy if exists "course_hw_submission_files_delete_owner" on public.course_homework_submission_files;
create policy "course_hw_submission_files_delete_owner"
on public.course_homework_submission_files
for delete
to authenticated
using (
  exists (
    select 1 from public.course_homework_submissions_v2 s
    where s.id = submission_id
      and s.student_id = auth.uid()
  )
);


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
