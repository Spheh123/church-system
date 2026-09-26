begin;
drop policy if exists attendance_read on public.service_attendance;
create policy attendance_read on public.service_attendance for select to authenticated using(public.current_role() in ('super_admin','admin','pastor'));
create or replace function public.save_attendance(p_id uuid,p_version integer,p_date date,p_type text,p_name text,p_men integer,p_women integer,p_teens integer,p_children integer) returns uuid
language plpgsql security definer set search_path=public as $$
declare result uuid; previous jsonb;
begin
 if coalesce(public.current_role(),'') not in ('super_admin','admin','pastor','usher') then raise exception 'Attendance access required'; end if;
 if p_id is null then
  insert into service_attendance(service_date,service_type,service_name,men,women,teens,children,recorded_by)
  values(p_date,p_type,case when p_type='Special event' then trim(coalesce(p_name,'')) else '' end,p_men,p_women,p_teens,p_children,auth.uid()) returning id into result;
 else
  if public.current_role()='usher' then raise exception 'Ask an administrator to correct recorded attendance'; end if;
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



commit;
