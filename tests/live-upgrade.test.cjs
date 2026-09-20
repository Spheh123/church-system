const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('Live-schema upgrade preserves records, adds relationships, and enables RLS atomically',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,encrypted_password text,raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 grant usage on schema public,auth to anon,authenticated,service_role;
 create table public.users(id uuid primary key,name text,email text,role text,created_at timestamp default now());
 create table public.people(id uuid primary key default gen_random_uuid(),full_name text,email text,phone text,area text,dob text,gender text,occupation text,marital_status text,service_feedback text,nsppdian text,next_sunday text,membership_interest text,whatsapp_group text,prayer_points text,invite text,invite_details text,created_at timestamp default now(),area_of_residence text);
 create table public.followups(id uuid primary key default gen_random_uuid(),person_id uuid,status text,assigned_to uuid,last_contacted timestamp,notes text,updated_at timestamp default now());
 create table public.activity_logs(id uuid primary key default gen_random_uuid(),user_id uuid,action text,person_id uuid,timestamp timestamp default now());
 insert into auth.users(id) values('11111111-1111-4111-8111-111111111111');
 insert into public.users(id,name,email,role) values('11111111-1111-4111-8111-111111111111','Sample Admin','admin@example.test','admin');
 insert into public.people(full_name,area) values('Preserved Person','Preserved Area');`);
 const sql=fs.readFileSync('supabase/live-upgrade.sql','utf8').replace('create extension if not exists pgcrypto;','');
 await db.exec(sql);
 assert.equal((await db.query('select count(*) from people')).rows[0].count,1);
 assert.equal((await db.query('select count(*) from followups')).rows[0].count,1);
 assert.equal((await db.query('select area_of_residence from people')).rows[0].area_of_residence,'Preserved Area');
 assert.equal((await db.query('select count(*) from church_backup_20260919.people')).rows[0].count,1);
 assert.equal((await db.query("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity")).rows[0].count,0);
 await db.exec('set role anon');
 await assert.rejects(db.query('select * from church_backup_20260919.people'),/permission denied/);
 await db.exec('reset role');
 await db.exec(sql);
 assert.equal((await db.query('select count(*) from followups')).rows[0].count,1);
 } finally {await db.close();}
});
