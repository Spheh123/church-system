begin;
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
commit;
