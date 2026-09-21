begin;
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
commit;
