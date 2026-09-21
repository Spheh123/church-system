begin;
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
commit;
