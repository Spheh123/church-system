-- Additive ministry operations. Existing visitor intake and follow-up data are preserved.
begin;
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
commit;

