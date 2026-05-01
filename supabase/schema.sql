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
