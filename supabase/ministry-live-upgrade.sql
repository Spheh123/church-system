BEGIN;
create schema if not exists church_backup_20260920; revoke all on schema church_backup_20260920 from public,anon,authenticated; create table if not exists church_backup_20260920.users as table public.users; create table if not exists church_backup_20260920.followups as table public.followups; revoke all on all tables in schema church_backup_20260920 from public,anon,authenticated;
-- ministry-operations.sql
-- Additive ministry operations. Existing visitor intake and follow-up data are preserved.

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check(role::text in ('admin','pastor','team','usher'));
alter table public.users add column if not exists available_for_assignment boolean not null default false;
create table if not exists public.service_attendance (
 id uuid primary key default gen_random_uuid(), service_date date not null,
 service_type text not null check(service_type in ('Sunday first','Sunday second','Wednesday','All-night prayer','Special event')),
 service_name text not null default '', men integer not null check(men between 0 and 100000),
 women integer not null check(women between 0 and 100000), teens integer not null check(teens between 0 and 100000),
 children integer not null check(children between 0 and 100000),
 recorded_by uuid not null references public.users(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), version integer not null default 1,
 unique(service_date,service_type,service_name),
 check(service_date <= (now() at time zone 'Africa/Johannesburg')::date), check(length(service_name)<=150),
 check(service_type <> 'Special event' or length(trim(service_name))>0)
);
create table if not exists public.visitor_events (
 id uuid primary key default gen_random_uuid(), person_id uuid not null references public.people(id),
 kind text not null check(kind in ('first_visit','return_visit','call','call_attempt','next_step','discipleship_started','discipleship_completed','membership_interest','member_joined')),
 occurred_on date not null check(occurred_on <= (now() at time zone 'Africa/Johannesburg')::date), detail text not null default '' check(length(detail)<=5000),
 created_by uuid not null references public.users(id), created_at timestamptz not null default now()
);
create unique index if not exists one_first_visit on public.visitor_events(person_id) where kind='first_visit';
create unique index if not exists one_visit_per_day on public.visitor_events(person_id,occurred_on) where kind in ('first_visit','return_visit');
create table if not exists public.care_requests (
 id uuid primary key default gen_random_uuid(),person_id uuid not null references public.people(id),
 reason text not null check(length(trim(reason)) between 1 and 3000),
 priority text not null default 'Normal' check(priority in ('Normal','Urgent')),
 status text not null default 'Open' check(status in ('Open','In progress','Responded')),
 assigned_to uuid references public.users(id), created_by uuid not null references public.users(id),
 created_at timestamptz not null default now(), responded_at timestamptz,
 response text not null default '' check(length(response)<=3000)
);
alter table public.service_attendance enable row level security;
alter table public.visitor_events enable row level security;
alter table public.care_requests enable row level security;
grant select on public.service_attendance to authenticated;
grant select,insert on public.visitor_events to authenticated;
grant select,insert,update on public.care_requests to authenticated;
drop policy if exists attendance_read on public.service_attendance;
create policy attendance_read on public.service_attendance for select to authenticated using(public.current_role() in ('admin','pastor','usher'));
drop policy if exists events_read on public.visitor_events;
create policy events_read on public.visitor_events for select to authenticated using(public.can_access_person(person_id));
drop policy if exists events_insert on public.visitor_events;
create policy events_insert on public.visitor_events for insert to authenticated with check(public.can_access_person(person_id) and created_by=auth.uid());
drop policy if exists care_read on public.care_requests;
create policy care_read on public.care_requests for select to authenticated using(public.can_access_person(person_id));
drop policy if exists care_insert on public.care_requests;
create policy care_insert on public.care_requests for insert to authenticated with check(public.can_access_person(person_id) and created_by=auth.uid() and status='Open' and assigned_to is null and responded_at is null and response='');
drop policy if exists care_update on public.care_requests;
create policy care_update on public.care_requests for update to authenticated using(public.current_role() in ('admin','pastor')) with check(public.current_role() in ('admin','pastor'));

create or replace function public.save_attendance(p_id uuid,p_version integer,p_date date,p_type text,p_name text,p_men integer,p_women integer,p_teens integer,p_children integer) returns uuid
language plpgsql security definer set search_path=public as $$
declare result uuid; previous jsonb;
begin
 if coalesce(public.current_role(),'') not in ('admin','pastor','usher') then raise exception 'Attendance access required'; end if;
 if p_id is null then
  insert into service_attendance(service_date,service_type,service_name,men,women,teens,children,recorded_by)
  values(p_date,p_type,case when p_type='Special event' then trim(coalesce(p_name,'')) else '' end,p_men,p_women,p_teens,p_children,auth.uid()) returning id into result;
 else
  select to_jsonb(s) into previous from service_attendance s where id=p_id for update;
  if previous is null then raise exception 'Service not found'; end if;
  if (previous->>'version')::integer is distinct from p_version then raise exception 'Someone changed this service. Reload before editing.'; end if;
  update service_attendance set men=p_men,women=p_women,teens=p_teens,children=p_children,updated_at=now(),version=version+1 where id=p_id returning id into result;
 end if;
 insert into activity_logs(user_id,action,details) values(auth.uid(),'attendance_saved',jsonb_build_object('service_id',result,'before',previous,'after',(select to_jsonb(s) from service_attendance s where id=result)));
 return result;
end $$;
revoke all on function public.save_attendance(uuid,integer,date,text,text,integer,integer,integer,integer) from public,anon;
grant execute on function public.save_attendance(uuid,integer,date,text,text,integer,integer,integer,integer) to authenticated;

create or replace function public.set_assignment_availability(p_user uuid,p_available boolean) returns void
language plpgsql security definer set search_path=public as $$ begin
 if coalesce(public.current_role(),'') not in ('admin','pastor') then raise exception 'Leader access required'; end if;
 update users set available_for_assignment=p_available where id=p_user and role::text='team' and is_active;
 if not found then raise exception 'Choose an active follow-up worker'; end if;
 insert into activity_logs(user_id,action,details) values(auth.uid(),'assignment_availability_changed',jsonb_build_object('staff_id',p_user,'available',p_available));
end $$;
revoke all on function public.set_assignment_availability(uuid,boolean) from public,anon;
grant execute on function public.set_assignment_availability(uuid,boolean) to authenticated;

create or replace function public.assign_waiting_visitors() returns integer
language plpgsql security definer set search_path=public as $$
declare visitor record; worker uuid; total integer:=0;
begin
 if coalesce(public.current_role(),'') not in ('admin','pastor') then raise exception 'Leader access required'; end if;
 perform pg_advisory_xact_lock(824651);
 for visitor in select person_id from followups where assigned_to is null and status not in ('completed','not_interested') order by person_id for update loop
  select u.id into worker from users u left join followups f on f.assigned_to=u.id and f.status not in ('completed','not_interested')
   where u.role::text='team' and u.is_active and u.available_for_assignment group by u.id order by count(f.id),u.id limit 1;
  exit when worker is null;
  update followups set assigned_to=worker where person_id=visitor.person_id;
  total:=total+1;
 end loop;
 return total;
end $$;
revoke all on function public.assign_waiting_visitors() from public,anon;
grant execute on function public.assign_waiting_visitors() to authenticated;

create or replace function public.guard_care_request() returns trigger language plpgsql set search_path=public as $$ begin
 if new.person_id<>old.person_id or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception 'Care request identity cannot change'; end if;
 if new.assigned_to is not null and not exists(select 1 from users where id=new.assigned_to and role::text='pastor' and is_active) then raise exception 'Choose an active pastor'; end if;
 if new.status='Responded' and trim(new.response)='' then raise exception 'Record the response before closing'; end if;
 new.responded_at:=case when new.status='Responded' then coalesce(old.responded_at,now()) else null end;
 return new;
end $$;
drop trigger if exists care_guard on public.care_requests;
create trigger care_guard before update on public.care_requests for each row execute function public.guard_care_request();



-- pastoral-notes.sql
-- Restricted notes never enter the general visitor view or ordinary audit payloads.

create table if not exists public.pastoral_notes (
 id uuid primary key default gen_random_uuid(), person_id uuid not null references public.people(id),
 note text not null check(length(trim(note)) between 1 and 10000),
 created_by uuid not null references public.users(id), created_at timestamptz not null default now()
);
alter table public.pastoral_notes enable row level security;
grant select,insert on public.pastoral_notes to authenticated;
drop policy if exists pastoral_read on public.pastoral_notes;
create policy pastoral_read on public.pastoral_notes for select to authenticated using(public.current_role() in ('admin','pastor'));
drop policy if exists pastoral_insert on public.pastoral_notes;
create policy pastoral_insert on public.pastoral_notes for insert to authenticated with check(public.current_role() in ('admin','pastor') and created_by=auth.uid());
create or replace function public.audit_ministry_change() returns trigger language plpgsql security definer set search_path=public as $$ begin
 insert into activity_logs(user_id,action,person_id,details) values(auth.uid(),TG_TABLE_NAME||'_'||lower(TG_OP),new.person_id,
  case when TG_TABLE_NAME='pastoral_notes' then jsonb_build_object('summary','Restricted pastoral note added') else jsonb_build_object('summary',replace(TG_TABLE_NAME,'_',' ')||' updated','record_id',new.id) end);
 return new;
end $$;
drop trigger if exists pastoral_audit on public.pastoral_notes;
create trigger pastoral_audit after insert on public.pastoral_notes for each row execute function public.audit_ministry_change();
drop trigger if exists journey_audit on public.visitor_events;
create trigger journey_audit after insert on public.visitor_events for each row execute function public.audit_ministry_change();
drop trigger if exists care_audit on public.care_requests;
create trigger care_audit after insert or update on public.care_requests for each row execute function public.audit_ministry_change();


-- automatic-assignment.sql
-- Automatic distribution only uses workers explicitly marked available by a leader.

create or replace function public.auto_assign_new_visitor() returns trigger language plpgsql security definer set search_path=public as $$
declare worker uuid;
begin
 if new.assigned_to is not null then return new; end if;
 perform pg_advisory_xact_lock(824651);
 select u.id into worker from users u left join followups f on f.assigned_to=u.id and f.status not in ('completed','not_interested')
 where u.role::text='team' and u.is_active and u.available_for_assignment group by u.id order by count(f.id),u.id limit 1;
 if worker is not null then new.assigned_to:=worker; end if;
 return new;
end $$;
drop trigger if exists auto_assign_visitor on public.followups;
create trigger auto_assign_visitor before insert on public.followups for each row execute function public.auto_assign_new_visitor();
-- Anonymous/service intake must not select confidential staff availability directly.
revoke all on function public.auto_assign_new_visitor() from public,anon,authenticated;


-- export-permissions.sql

alter table public.users add column if not exists can_export_sensitive boolean not null default false;
create or replace function public.set_sensitive_export(p_user uuid,p_enabled boolean) returns void
language plpgsql security definer set search_path=public as $$ begin
 if public.current_role() is distinct from 'admin' then raise exception 'Administrator access required'; end if;
 update users set can_export_sensitive=p_enabled where id=p_user and role::text in ('admin','pastor') and is_active;
 if not found then raise exception 'Choose an active leader'; end if;
 insert into activity_logs(user_id,action,details) values(auth.uid(),'sensitive_export_permission',jsonb_build_object('staff_id',p_user,'enabled',p_enabled));
end $$;
revoke all on function public.set_sensitive_export(uuid,boolean) from public,anon;
grant execute on function public.set_sensitive_export(uuid,boolean) to authenticated;


-- visitor-intake-journey.sql

alter table public.visitor_events alter column created_by drop not null;
create or replace function public.submit_public_visit(p_visit_date date,p_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare person uuid;
begin
 if p_visit_date is null or p_visit_date>(now() at time zone 'Africa/Johannesburg')::date or p_visit_date<date '2000-01-01' then raise exception 'Enter a valid service date'; end if;
 if length(p_data::text)>50000 then raise exception 'Visitor entry is too large'; end if;
 person:=public.submit_public_person(p_full_name=>p_data->>'full_name',p_email=>p_data->>'email',p_phone=>p_data->>'phone',p_area_of_residence=>p_data->>'area_of_residence',p_dob=>p_data->>'dob',p_gender=>p_data->>'gender',p_occupation=>p_data->>'occupation',p_marital_status=>p_data->>'marital_status',p_service_feedback=>p_data->>'service_feedback',p_nsppdian=>p_data->>'nsppdian',p_next_sunday=>p_data->>'next_sunday',p_membership_interest=>p_data->>'membership_interest',p_whatsapp_group=>p_data->>'whatsapp_group',p_prayer_points=>p_data->>'prayer_points',p_invite=>p_data->>'invite',p_invite_details=>p_data->>'invite_details');
 insert into visitor_events(person_id,kind,occurred_on,detail,created_by)values(person,'first_visit',p_visit_date,'Recorded from public visitor intake',null);
 return person;
end $$;
revoke all on function public.submit_public_visit(date,jsonb) from public;
grant execute on function public.submit_public_visit(date,jsonb) to anon,authenticated;
-- Never copy restricted text into the shared audit log.
create or replace function public.audit_ministry_change() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if auth.uid() is not null and exists(select 1 from users where id=auth.uid()) then
 insert into activity_logs(user_id,action,person_id,details) values(auth.uid(),TG_TABLE_NAME||'_'||lower(TG_OP),new.person_id,
  case when TG_TABLE_NAME='pastoral_notes' then jsonb_build_object('summary','Restricted pastoral note added') else jsonb_build_object('summary',replace(TG_TABLE_NAME,'_',' ')||' updated','record_id',new.id) end);
 end if;
 return new;
end $$;


-- contact-milestones.sql

-- Record a successful contact when the follow-up workflow records one.
create or replace function public.record_contact_milestone() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if new.last_contacted is distinct from old.last_contacted and new.last_contacted is not null and new.status in ('contacted','feedback_given') and auth.uid() is not null then
 insert into visitor_events(person_id,kind,occurred_on,detail,created_by) values(new.person_id,'call',(new.last_contacted at time zone 'Africa/Johannesburg')::date,'Contact recorded through follow-up status',auth.uid());
 end if;
 return new;
end $$;
drop trigger if exists contact_milestone on public.followups;
create trigger contact_milestone after update on public.followups for each row execute function public.record_contact_milestone();
revoke all on function public.record_contact_milestone() from public,anon,authenticated;
-- An usher must never become the owner of a visitor through any assignment UI.
create or replace function public.guard_followup() returns trigger language plpgsql set search_path=public as $$ begin
 if auth.role()='authenticated' then
 if new.id<>old.id or new.person_id<>old.person_id then raise exception 'Record identity cannot change'; end if;
 if new.assigned_to is distinct from old.assigned_to and public.current_role() not in ('admin','pastor') then raise exception 'Only leaders can assign people'; end if;
 if new.assigned_to is not null and not exists(select 1 from users where id=new.assigned_to and is_active and role::text in ('admin','pastor','team')) then raise exception 'Choose an active follow-up worker or leader'; end if;
 end if;
 new.updated_at:=now();return new;
end $$;


-- ministry-finalize.sql

create or replace function public.save_attendance(p_id uuid,p_version integer,p_date date,p_type text,p_name text,p_men integer,p_women integer,p_teens integer,p_children integer) returns uuid
language plpgsql security definer set search_path=public as $$
declare result uuid; previous jsonb;
begin
 if coalesce(public.current_role(),'') not in ('admin','pastor','usher') then raise exception 'Attendance access required'; end if;
 if p_id is null then
  insert into service_attendance(service_date,service_type,service_name,men,women,teens,children,recorded_by)
  values(p_date,p_type,case when p_type='Special event' then trim(coalesce(p_name,'')) else '' end,p_men,p_women,p_teens,p_children,auth.uid()) returning id into result;
 else
  select to_jsonb(s) into previous from service_attendance s where id=p_id for update;
  if previous is null then raise exception 'Service not found'; end if;
  if (previous->>'version')::integer is distinct from p_version then raise exception 'Someone changed this service. Reload before editing.'; end if;
  update service_attendance set men=p_men,women=p_women,teens=p_teens,children=p_children,updated_at=now(),version=version+1 where id=p_id returning id into result;
 end if;
 insert into activity_logs(user_id,action,details) values(auth.uid(),'attendance_saved',jsonb_build_object('service_id',result,'before',previous,'after',(select to_jsonb(s) from service_attendance s where id=result)));
 return result;
end $$;
revoke all on function public.save_attendance(uuid,integer,date,text,text,integer,integer,integer,integer) from public,anon;
grant execute on function public.save_attendance(uuid,integer,date,text,text,integer,integer,integer,integer) to authenticated;


create unique index if not exists attendance_service_identity on public.service_attendance(service_date,service_type,lower(trim(service_name)));
do $$ declare item text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach item in array array['service_attendance','visitor_events','care_requests','pastoral_notes'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=item) then execute format('alter publication supabase_realtime add table public.%I',item); end if;
 end loop;end if;end $$;

COMMIT;