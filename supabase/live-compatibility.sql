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
