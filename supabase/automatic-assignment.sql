-- Automatic distribution only uses workers explicitly marked available by a leader.
begin;
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
commit;
