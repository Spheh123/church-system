begin;

drop policy if exists "leaders read sessions" on public.login_sessions;
create policy "leaders read sessions" on public.login_sessions
for select to authenticated
using (public.current_role() in ('super_admin','admin','pastor'));

drop policy if exists "activity read" on public.activity_logs;
create policy "activity read" on public.activity_logs
for select to authenticated
using (
  public.current_role() in ('super_admin','admin','pastor')
  or (person_id is not null and public.can_access_person(person_id))
);

commit;
