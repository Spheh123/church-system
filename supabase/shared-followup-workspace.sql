begin;
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check(role::text in ('super_admin','admin','coordinator','pastor','team','usher'));
alter table public.users add column if not exists can_export_reports boolean not null default false;
update public.users set role='super_admin',can_export_reports=true where lower(email)='chavulasphelele@gmail.com';
update public.users set role='coordinator',can_export_reports=false,can_export_sensitive=false where lower(email)='esthernsky@gmail.com';
update public.users set available_for_assignment=true where role::text='team' and is_active;

create or replace function public.can_access_person(target_person uuid) returns boolean language sql stable security definer set search_path=public
as $$ select coalesce(public.current_role() in ('super_admin','admin','coordinator','pastor','team'),false) $$;
drop policy if exists "users read" on public.users;
create policy "users read" on public.users for select to authenticated using(id=auth.uid() or public.current_role() in ('super_admin','admin','coordinator','pastor') or (public.current_role()='team' and role::text='team' and is_active));
drop policy if exists "followups update" on public.followups;
create policy "followups update" on public.followups for update to authenticated using(public.current_role() in ('super_admin','admin','coordinator','pastor','team')) with check(public.current_role() in ('super_admin','admin','coordinator','pastor','team'));
create or replace function public.guard_followup() returns trigger language plpgsql set search_path=public as $$ begin
 if auth.role()='authenticated' then
  if new.id<>old.id or new.person_id<>old.person_id then raise exception 'Record identity cannot change'; end if;
  if new.assigned_to is distinct from old.assigned_to and public.current_role() not in ('super_admin','admin','coordinator','pastor','team') then raise exception 'Follow-up access required'; end if;
  if new.assigned_to is not null and not exists(select 1 from users where id=new.assigned_to and is_active and role::text='team') then raise exception 'Choose an active follow-up worker'; end if;
 end if; new.updated_at:=now(); return new;
end $$;
create or replace function public.save_followup(p_person uuid,p_status text,p_assigned uuid,p_note text,p_due timestamptz) returns void language plpgsql security invoker set search_path=public as $$ begin
 if not public.can_access_person(p_person) then raise exception 'Access denied'; end if;
 if length(coalesce(p_note,''))>10000 then raise exception 'Note is too long'; end if;
 if p_assigned is not null and not exists(select 1 from users where id=p_assigned and role::text='team' and is_active) then raise exception 'Choose an active follow-up worker'; end if;
 update followups set status=p_status,assigned_to=p_assigned,notes=case when trim(coalesce(p_note,''))<>'' then trim(p_note) else notes end,next_followup_at=p_due,last_contacted=case when p_status in ('contacted','feedback_given','completed') and status is distinct from p_status then now() else last_contacted end where person_id=p_person;
 if not found then raise exception 'Follow-up unavailable'; end if;
 if trim(coalesce(p_note,''))<>'' then insert into followup_notes(person_id,user_id,note) values(p_person,auth.uid(),trim(p_note)); end if;
end $$;
revoke all on function public.save_followup(uuid,text,uuid,text,timestamptz) from public,anon;
grant execute on function public.save_followup(uuid,text,uuid,text,timestamptz) to authenticated;
drop policy if exists "leaders read sessions" on public.login_sessions;
create policy "leaders read sessions" on public.login_sessions for select to authenticated using(public.current_role() in ('super_admin','admin','coordinator','pastor'));
drop policy if exists "leaders edit people" on public.people;
create policy "leaders edit people" on public.people for update to authenticated using(public.current_role() in ('super_admin','admin','coordinator','pastor')) with check(public.current_role() in ('super_admin','admin','coordinator','pastor'));
drop policy if exists pastoral_read on public.pastoral_notes;
create policy pastoral_read on public.pastoral_notes for select to authenticated using(public.current_role() in ('super_admin','admin','coordinator','pastor'));
drop policy if exists pastoral_insert on public.pastoral_notes;
create policy pastoral_insert on public.pastoral_notes for insert to authenticated with check(public.current_role() in ('super_admin','admin','coordinator','pastor') and created_by=auth.uid());
drop policy if exists care_update on public.care_requests;
create policy care_update on public.care_requests for update to authenticated using(public.current_role() in ('super_admin','admin','coordinator','pastor')) with check(public.current_role() in ('super_admin','admin','coordinator','pastor'));
drop policy if exists attendance_read on public.service_attendance;
create policy attendance_read on public.service_attendance for select to authenticated using(public.current_role() in ('super_admin','admin','pastor'));
create or replace function public.set_staff_access(actor uuid,target uuid,enabled boolean) returns void language plpgsql security definer set search_path=public as $$ begin
 perform pg_advisory_xact_lock(728190);
 if actor=target or not exists(select 1 from users where id=actor and role::text in ('super_admin','admin','pastor') and is_active) then raise exception 'Leadership access required'; end if;
 if not exists(select 1 from users where id=target) then raise exception 'Staff account not found'; end if;
 if not enabled and exists(select 1 from users where id=target and role::text='super_admin') and (select count(*) from users where role::text='super_admin' and is_active)<=1 then raise exception 'Keep at least one active Super Admin'; end if;
 update users set is_active=enabled where id=target;
 insert into activity_logs(user_id,action,details) values(actor,'access_changed',jsonb_build_object('summary',case when enabled then 'Enabled staff access' else 'Disabled staff access' end,'target_user_id',target));
end $$;
revoke all on function public.set_staff_access(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_staff_access(uuid,uuid,boolean) to service_role;
create or replace function public.set_sensitive_export(p_user uuid,p_enabled boolean) returns void language plpgsql security definer set search_path=public as $$ begin
 if public.current_role() not in ('super_admin','admin') then raise exception 'Administrator access required'; end if;
 update users set can_export_sensitive=p_enabled where id=p_user and role::text in ('pastor','super_admin','admin') and is_active;
 if not found then raise exception 'Choose an active leader'; end if;
 insert into activity_logs(user_id,action,details) values(auth.uid(),'sensitive_export_permission',jsonb_build_object('staff_id',p_user,'enabled',p_enabled));
end $$;
create or replace function public.set_report_export(p_user uuid,p_enabled boolean) returns void language plpgsql security definer set search_path=public as $$ begin
 if public.current_role() not in ('super_admin','pastor') then raise exception 'Super Admin or pastor approval required'; end if;
 update users set can_export_reports=p_enabled where id=p_user and role::text='coordinator' and is_active;
 if not found then raise exception 'Choose an active Operations Admin'; end if;
 insert into activity_logs(user_id,action,details) values(auth.uid(),'report_export_permission',jsonb_build_object('staff_id',p_user,'enabled',p_enabled));
end $$;
revoke all on function public.set_report_export(uuid,boolean) from public,anon;
grant execute on function public.set_report_export(uuid,boolean) to authenticated;
commit;
