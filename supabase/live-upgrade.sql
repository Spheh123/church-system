-- Church workspace upgrade: private backup, compatibility, security and workflows.
BEGIN;
-- SOURCE: live-compatibility.sql
-- Compatibility with the live database inspected on 19 September 2026.
-- Existing data: 1 person, 3 staff profiles, no followups or activity logs.
-- Run inside the same transaction as schema.sql and the upgrade scripts.
create schema if not exists church_backup_20260919;
revoke all on schema church_backup_20260919 from public, anon, authenticated;
create table if not exists church_backup_20260919.people as table public.people;
create table if not exists church_backup_20260919.users as table public.users;
create table if not exists church_backup_20260919.followups as table public.followups;
create table if not exists church_backup_20260919.activity_logs as table public.activity_logs;
revoke all on all tables in schema church_backup_20260919 from public, anon, authenticated;

drop view if exists public.people_overview;
alter table public.activity_logs add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.people add column if not exists area_of_residence text;
update public.people set area_of_residence=area where nullif(trim(area_of_residence),'') is null and area is not null;
-- The original now() timestamps were stored without time zone on the UTC server.
do $$ declare item record; begin
  for item in select table_name,column_name from information_schema.columns
    where table_schema='public' and table_name in ('users','people','followups','activity_logs') and data_type='timestamp without time zone'
  loop
    execute format('alter table public.%I alter column %I type timestamptz using %I at time zone ''UTC''',item.table_name,item.column_name,item.column_name);
  end loop;
end $$;
create unique index if not exists followups_person_id_unique on public.followups(person_id);
do $$ begin
  alter table public.users add constraint users_auth_id_fk foreign key(id) references auth.users(id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.followups add constraint followups_person_id_fk foreign key(person_id) references public.people(id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.followups add constraint followups_assigned_to_fk foreign key(assigned_to) references public.users(id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.activity_logs add constraint activity_logs_user_id_fk foreign key(user_id) references public.users(id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.activity_logs add constraint activity_logs_person_id_fk foreign key(person_id) references public.people(id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.users add constraint users_role_check check(role::text in ('admin','pastor','team'));
exception when duplicate_object then null; end $$;

-- SOURCE: schema.sql
create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('admin', 'pastor', 'team');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.followup_status as enum (
    'not_called',
    'called_no_answer',
    'voicemail',
    'feedback_given',
    'not_interested',
    'follow_up_again'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role public.user_role not null default 'team',
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  last_active_at timestamptz,
  last_login_at timestamptz
);

alter table public.users add column if not exists created_by uuid references public.users(id) on delete set null;
alter table public.users add column if not exists last_active_at timestamptz;
alter table public.users add column if not exists last_login_at timestamptz;

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  area_of_residence text,
  dob text,
  gender text,
  occupation text,
  marital_status text,
  service_feedback text,
  nsppdian text,
  next_sunday text,
  membership_interest text,
  whatsapp_group text,
  prayer_points text,
  invite text,
  invite_details text,
  created_at timestamptz not null default now()
);

create or replace function public.submit_public_person(
  p_full_name text,
  p_email text default null,
  p_phone text default null,
  p_area_of_residence text default null,
  p_dob text default null,
  p_gender text default null,
  p_occupation text default null,
  p_marital_status text default null,
  p_service_feedback text default null,
  p_nsppdian text default null,
  p_next_sunday text default null,
  p_membership_interest text default null,
  p_whatsapp_group text default null,
  p_prayer_points text default null,
  p_invite text default null,
  p_invite_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_person_id uuid;
begin
  insert into public.people (
    full_name,
    email,
    phone,
    area_of_residence,
    dob,
    gender,
    occupation,
    marital_status,
    service_feedback,
    nsppdian,
    next_sunday,
    membership_interest,
    whatsapp_group,
    prayer_points,
    invite,
    invite_details
  )
  values (
    nullif(trim(p_full_name), ''),
    nullif(trim(p_email), ''),
    nullif(trim(p_phone), ''),
    nullif(trim(p_area_of_residence), ''),
    nullif(trim(p_dob), ''),
    nullif(trim(p_gender), ''),
    nullif(trim(p_occupation), ''),
    nullif(trim(p_marital_status), ''),
    nullif(trim(p_service_feedback), ''),
    nullif(trim(p_nsppdian), ''),
    nullif(trim(p_next_sunday), ''),
    nullif(trim(p_membership_interest), ''),
    nullif(trim(p_whatsapp_group), ''),
    nullif(trim(p_prayer_points), ''),
    nullif(trim(p_invite), ''),
    nullif(trim(p_invite_details), '')
  )
  returning id into new_person_id;

  return new_person_id;
end;
$$;

create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null unique references public.people(id) on delete cascade,
  status public.followup_status not null default 'not_called',
  assigned_to uuid references public.users(id) on delete set null,
  last_contacted timestamptz,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.followup_notes (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  action text not null,
  person_id uuid references public.people(id) on delete cascade,
  details jsonb not null default '{}'::jsonb,
  timestamp timestamptz not null default now()
);

create or replace function public.create_default_followup()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.followups (person_id) values (new.id)
  on conflict (person_id) do nothing;
  return new;
end;
$$;

drop trigger if exists people_create_followup on public.people;
create trigger people_create_followup
after insert on public.people
for each row execute function public.create_default_followup();

create or replace view public.people_overview
with (security_invoker = true) as
select
  p.id as person_id,
  p.full_name,
  p.email,
  p.phone,
  p.area_of_residence,
  p.dob,
  p.gender,
  p.occupation,
  p.marital_status,
  p.service_feedback,
  p.nsppdian,
  p.next_sunday,
  p.membership_interest,
  p.whatsapp_group,
  p.prayer_points,
  p.invite,
  p.invite_details,
  p.created_at,
  f.id as followup_id,
  f.status,
  f.assigned_to,
  f.last_contacted,
  f.notes as followup_notes,
  f.updated_at,
  u.name as assigned_name,
  u.email as assigned_email
from public.people p
left join public.followups f on f.person_id = p.id
left join public.users u on u.id = f.assigned_to;

grant select on public.people_overview to authenticated;
grant select on public.users to authenticated;
grant select on public.people to authenticated;
grant select, update on public.followups to authenticated;
grant select, insert on public.followup_notes to authenticated;
grant select, insert on public.activity_logs to authenticated;
grant execute on function public.submit_public_person(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to anon, authenticated;

create or replace function public.touch_my_presence(mark_login boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set
    last_active_at = now(),
    last_login_at = case when mark_login then now() else last_login_at end
  where id = auth.uid();
end;
$$;

grant execute on function public.touch_my_presence(boolean) to authenticated;

create or replace function public.current_role()
returns text
language sql
stable
as $$
  select role::text from public.users where id = auth.uid()
$$;

create or replace function public.can_access_person(target_person uuid)
returns boolean
language sql
stable
as $$
  select
    public.current_role() in ('admin', 'pastor', 'team')
$$;

alter table public.users enable row level security;
alter table public.people enable row level security;
alter table public.followups enable row level security;
alter table public.followup_notes enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "users read" on public.users;
create policy "users read"
on public.users for select
to authenticated
using (true);

drop policy if exists "people select" on public.people;
create policy "people select"
on public.people for select
to authenticated
using (public.can_access_person(id));

drop policy if exists "followups select" on public.followups;
create policy "followups select"
on public.followups for select
to authenticated
using (public.can_access_person(person_id));

drop policy if exists "followups update" on public.followups;
create policy "followups update"
on public.followups for update
to authenticated
using (
  public.current_role() in ('admin', 'pastor')
  or assigned_to = auth.uid()
  or assigned_to is null
)
with check (
  public.current_role() in ('admin', 'pastor')
  or assigned_to = auth.uid()
);

drop policy if exists "notes read" on public.followup_notes;
create policy "notes read"
on public.followup_notes for select
to authenticated
using (public.can_access_person(person_id));

drop policy if exists "notes insert" on public.followup_notes;
create policy "notes insert"
on public.followup_notes for insert
to authenticated
with check (user_id = auth.uid() and public.can_access_person(person_id));

drop policy if exists "activity read" on public.activity_logs;
create policy "activity read"
on public.activity_logs for select
to authenticated
using (person_id is null or public.can_access_person(person_id));

drop policy if exists "activity insert" on public.activity_logs;
create policy "activity insert"
on public.activity_logs for insert
to authenticated
with check (user_id = auth.uid());

-- SOURCE: upgrade.sql
-- Run AFTER schema.sql. Additive upgrade: preserves existing people and history.

drop view if exists public.people_overview;
alter table public.users add column if not exists is_active boolean not null default true;
alter table public.followups add column if not exists next_followup_at timestamptz;
alter table public.people add column if not exists source_id text;
alter table public.people add column if not exists source_timestamp text;
create unique index if not exists people_source_id on public.people(source_id);
-- Keep all legacy status values; add the requested workflow without losing data.
alter table public.followups alter column status drop default;
alter table public.followups alter column status type text using status::text;
alter table public.followups alter column status set default 'not_called';
alter table public.followups drop constraint if exists followups_status_check;
alter table public.followups add constraint followups_status_check check (status in
  ('not_called','called_no_answer','voicemail','feedback_given','not_interested','follow_up_again','contacted','completed'));
create index if not exists followups_assignment on public.followups(assigned_to);
create index if not exists notes_person_date on public.followup_notes(person_id, created_at desc);
create index if not exists activity_person_date on public.activity_logs(person_id, timestamp desc);
insert into public.followups(person_id) select id from public.people on conflict(person_id) do nothing;

create or replace function public.current_role() returns text
language sql stable security definer set search_path = public
as $$ select role::text from public.users where id = auth.uid() and is_active $$;
create or replace function public.can_access_person(target_person uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.current_role() in ('admin','pastor') or
  (public.current_role() = 'team' and exists(select 1 from public.followups where person_id = target_person and assigned_to = auth.uid())), false) $$;

drop policy if exists "users read" on public.users;
create policy "users read" on public.users for select to authenticated
using (id = auth.uid() or public.current_role() in ('admin','pastor') or
  (public.current_role() = 'team' and exists(select 1 from public.followup_notes n where n.user_id = users.id and public.can_access_person(n.person_id))));
drop policy if exists "followups update" on public.followups;
create policy "followups update" on public.followups for update to authenticated
using (public.can_access_person(person_id)) with check (public.can_access_person(person_id));
drop policy if exists "activity read" on public.activity_logs;
create policy "activity read" on public.activity_logs for select to authenticated
using (public.current_role() in ('admin','pastor') or (person_id is not null and public.can_access_person(person_id)));
drop policy if exists "activity insert" on public.activity_logs;
create policy "activity insert" on public.activity_logs for insert to authenticated
with check (user_id = auth.uid() and public.current_role() is not null and
  action in ('viewed_record','viewed_directory','report_exported') and
  (person_id is null or public.can_access_person(person_id)));

create or replace function public.guard_followup() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.role() = 'authenticated' then
    if new.id <> old.id or new.person_id <> old.person_id then raise exception 'Record identity cannot change'; end if;
    if new.assigned_to is distinct from old.assigned_to and public.current_role() not in ('admin','pastor') then raise exception 'Only leaders can assign people'; end if;
    if new.assigned_to is not null and not exists(select 1 from public.users where id = new.assigned_to and is_active) then raise exception 'Choose an active staff member'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists followup_guard on public.followups;
create trigger followup_guard before update on public.followups for each row execute function public.guard_followup();

create or replace function public.audit_followup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    insert into public.activity_logs(user_id, action, person_id, details)
    values(auth.uid(), case when new.assigned_to is distinct from old.assigned_to then 'assignment_changed' else 'followup_updated' end,
      new.person_id, jsonb_build_object('summary', 'Follow-up updated', 'before', to_jsonb(old), 'after', to_jsonb(new)));
  end if;
  return new;
end $$;
drop trigger if exists followup_audit on public.followups;
create trigger followup_audit after update on public.followups for each row execute function public.audit_followup();
create or replace function public.audit_note() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_logs(user_id, action, person_id, details)
  values(new.user_id, 'note_added', new.person_id, jsonb_build_object('summary', 'Added a follow-up note', 'note_id', new.id));
  return new;
end $$;
drop trigger if exists note_audit on public.followup_notes;
create trigger note_audit after insert on public.followup_notes for each row execute function public.audit_note();

create or replace function public.save_followup(p_person uuid, p_status text, p_assigned uuid, p_note text, p_due timestamptz)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.can_access_person(p_person) then raise exception 'Access denied'; end if;
  if length(coalesce(p_note,'')) > 10000 then raise exception 'Note is too long'; end if;
  update public.followups set status = p_status,
    assigned_to = case when public.current_role() in ('admin','pastor') then p_assigned else assigned_to end,
    notes = case when trim(coalesce(p_note,'')) <> '' then trim(p_note) else notes end,
    next_followup_at = p_due,
    last_contacted = case when p_status in ('contacted','feedback_given','completed') and status is distinct from p_status then now() else last_contacted end
  where person_id = p_person;
  if not found then raise exception 'Follow-up unavailable'; end if;
  if trim(coalesce(p_note,'')) <> '' then
    insert into public.followup_notes(person_id,user_id,note) values(p_person,auth.uid(),trim(p_note));
  end if;
end $$;
revoke all on function public.save_followup(uuid,text,uuid,text,timestamptz) from public, anon;
grant execute on function public.save_followup(uuid,text,uuid,text,timestamptz) to authenticated;

create table if not exists public.login_sessions (
  id uuid primary key, user_id uuid not null references public.users(id),
  started_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  ended_at timestamptz, active_seconds integer not null default 0,
  was_active boolean not null default false, ip_address text, location text, device text
);
alter table public.login_sessions enable row level security;
grant select on public.login_sessions to authenticated;
drop policy if exists "leaders read sessions" on public.login_sessions;
create policy "leaders read sessions" on public.login_sessions for select to authenticated using (public.current_role() in ('admin','pastor'));
create index if not exists session_user_date on public.login_sessions(user_id, started_at desc);
create or replace function public.record_staff_session(p_session uuid, p_user uuid, p_action text, p_active boolean, p_ip text, p_location text, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.login_sessions; fresh boolean := false; added integer := 0;
begin
  if not exists(select 1 from public.users where id = p_user and is_active) then raise exception 'Account disabled'; end if;
  if p_action not in ('heartbeat','logout') then raise exception 'Invalid action'; end if;
  insert into public.login_sessions(id,user_id,ip_address,location,device,was_active)
    values(p_session,p_user,p_ip,p_location,p_device,p_active) on conflict(id) do nothing;
  fresh := found;
  select * into s from public.login_sessions where id = p_session for update;
  if s.user_id <> p_user or s.ended_at is not null then raise exception 'Session ended. Sign in again.'; end if;
  if fresh then
    insert into public.activity_logs(user_id,action,details) values(p_user,'login',jsonb_build_object('summary','Signed in','session_id',p_session));
    update public.users set last_login_at = now() where id = p_user;
  end if;
  -- No background/closed-tab hours and no double counting concurrent tabs.
  if s.was_active and p_active and now() - s.last_seen_at <= interval '90 seconds' then
    added := least(60,greatest(0,floor(extract(epoch from now()-s.last_seen_at))::integer));
  end if;
  update public.login_sessions set last_seen_at = now(), active_seconds = active_seconds + added,
    was_active = p_active, ended_at = case when p_action = 'logout' then now() else null end
    where id = p_session returning * into s;
  if p_active then update public.users set last_active_at = now() where id = p_user; end if;
  if p_action = 'logout' then
    insert into public.activity_logs(user_id,action,details) values(p_user,'logout',jsonb_build_object('summary','Signed out','session_id',p_session,'duration_seconds',extract(epoch from s.ended_at-s.started_at),'active_seconds',s.active_seconds));
  end if;
  return to_jsonb(s);
end $$;
revoke all on function public.record_staff_session(uuid,uuid,text,boolean,text,text,text) from public, anon, authenticated;
grant execute on function public.record_staff_session(uuid,uuid,text,boolean,text,text,text) to service_role;
-- Retire client-controlled login timestamps.
revoke all on function public.touch_my_presence(boolean) from public, anon, authenticated;

create or replace function public.set_staff_access(actor uuid, target uuid, enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(728190);
  if actor = target or not exists(select 1 from public.users where id=actor and role='admin' and is_active) then raise exception 'Admin access required'; end if;
  if not exists(select 1 from public.users where id=target) then raise exception 'Staff account not found'; end if;
  if not enabled and exists(select 1 from public.users where id=target and role='admin') and
    (select count(*) from public.users where role='admin' and is_active) <= 1 then raise exception 'Keep at least one active admin'; end if;
  update public.users set is_active=enabled where id=target;
  insert into public.activity_logs(user_id,action,details) values(actor,'access_changed',jsonb_build_object('summary',case when enabled then 'Enabled staff access' else 'Disabled staff access' end,'target_user_id',target));
end $$;
revoke all on function public.set_staff_access(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.set_staff_access(uuid,uuid,boolean) to service_role;

-- This view extends the existing contract; the new columns are appended.
create or replace view public.people_overview with (security_invoker=true) as
select p.id as person_id,p.full_name,p.email,p.phone,p.area_of_residence,p.dob,p.gender,p.occupation,p.marital_status,
 p.service_feedback,p.nsppdian,p.next_sunday,p.membership_interest,p.whatsapp_group,p.prayer_points,p.invite,p.invite_details,p.created_at,
 f.id as followup_id,f.status,f.assigned_to,f.last_contacted,f.notes as followup_notes,f.updated_at,u.name as assigned_name,u.email as assigned_email,
 f.next_followup_at,p.source_id,p.source_timestamp
from public.people p left join public.followups f on f.person_id=p.id left join public.users u on u.id=f.assigned_to;
grant select on public.people_overview to authenticated;
-- Realtime must be explicitly enabled; adding listeners alone does not enable it.
do $$ declare t text; begin
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if;
  foreach t in array array['people','followups','followup_notes','users','activity_logs','login_sessions'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;


-- SOURCE: profile-edit.sql
-- Run after upgrade.sql. Profile corrections are restricted to leaders.

grant update(full_name,email,phone,area_of_residence,dob,gender,occupation,marital_status,service_feedback,nsppdian,next_sunday,membership_interest,whatsapp_group,prayer_points,invite,invite_details) on public.people to authenticated;
drop policy if exists "leaders edit people" on public.people;
create policy "leaders edit people" on public.people for update to authenticated
using (public.current_role() in ('admin','pastor')) with check (public.current_role() in ('admin','pastor'));
create or replace function public.validate_person() returns trigger
language plpgsql set search_path=public as $$
declare field text; value text;
begin
  if nullif(trim(new.full_name), '') is null then raise exception 'Name is required'; end if;
  for field,value in select key, v from jsonb_each_text(to_jsonb(new)) as entry(key,v) loop
    if length(value) > (case when field in ('prayer_points','service_feedback','invite_details') then 10000 else 500 end) then
      raise exception 'Field % is too long', field;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists person_validation on public.people;
create trigger person_validation before insert or update on public.people for each row execute function public.validate_person();
create or replace function public.audit_person() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null then
    insert into public.activity_logs(user_id,action,person_id,details)
    values(auth.uid(),'profile_edited',new.id,jsonb_build_object('summary','Corrected person details','before',to_jsonb(old),'after',to_jsonb(new)));
  end if;
  return new;
end $$;
drop trigger if exists person_audit on public.people;
create trigger person_audit after update on public.people for each row execute function public.audit_person();


-- SOURCE: password-policy.sql
-- Strict staff password management. Run after upgrade.sql.
-- Supabase's admin API updates password and app_metadata in the same transaction.
-- Defer the check to transaction end so it sees BOTH changes. Ordinary users
-- cannot change app_metadata, including through the direct Auth API.
-- Validate against the hosted Auth version with a disposable staff account
-- before admitting the team. Provider-side password rehashing also hits this
-- guard: revisit it when changing Auth hashing configuration.

create or replace function public.enforce_managed_staff_password() returns trigger
language plpgsql security definer set search_path = public as $$
declare final_nonce text;
begin
  if old.encrypted_password is not distinct from new.encrypted_password then return null; end if;
  if not exists(select 1 from public.users where id=new.id) then return null; end if;
  select raw_app_meta_data->>'staff_password_change' into final_nonce from auth.users where id=new.id;
  if final_nonce is null or final_nonce = coalesce(old.raw_app_meta_data->>'staff_password_change','') then
    raise exception 'Staff passwords must be generated by the church administrator';
  end if;
  return null;
end $$;
revoke all on function public.enforce_managed_staff_password() from public, anon, authenticated;
drop trigger if exists managed_staff_password on auth.users;
create constraint trigger managed_staff_password after update on auth.users
deferrable initially deferred for each row execute function public.enforce_managed_staff_password();

-- Emergency rollback for an incompatible Auth upgrade (SQL editor only):
-- DROP TRIGGER managed_staff_password ON auth.users;

COMMIT;
