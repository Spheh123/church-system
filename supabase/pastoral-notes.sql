-- Restricted notes never enter the general visitor view or ordinary audit payloads.
begin;
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
commit;
