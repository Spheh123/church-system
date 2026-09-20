-- Run after upgrade.sql. Profile corrections are restricted to leaders.
begin;
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
commit;
