const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
test('Database enforces assigned-only care, leader audit visibility and immutable assignments', async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, encrypted_password text, raw_app_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;`);
  await db.exec(fs.readFileSync('supabase/schema.sql','utf8').replace('create extension if not exists pgcrypto;',''));
  const migration = fs.readFileSync('supabase/upgrade.sql','utf8');
  await db.exec(migration);
  await db.exec(fs.readFileSync("supabase/profile-edit.sql","utf8"));
  await db.exec(migration); // Upgrade must be safe to rerun.
  const admin='11111111-1111-4111-8111-111111111111', pastor='22222222-2222-4222-8222-222222222222', team='33333333-3333-4333-8333-333333333333', other='44444444-4444-4444-8444-444444444444';
  const one='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', two='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  for(const [id,role] of [[admin,'admin'],[pastor,'pastor'],[team,'team'],[other,'team']]) {
    await db.query('insert into auth.users(id) values($1)',[id]);
    await db.query('insert into public.users(id,name,email,role) values($1,$2::text,$3,$2::text::public.user_role)',[id,role,id+'@example.test']);
  }
  await db.query("insert into people(id,full_name) values($1,'Assigned Visitor'),($2,'Other Visitor')",[one,two]);
  await db.query('update followups set assigned_to=$1 where person_id=$2',[team,one]);
  async function asUser(id, sql) {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); select set_config('request.jwt.claim.role','authenticated',false); set role authenticated;`);
    return db.query(sql);
  }
  assert.equal((await asUser(team,'select * from people_overview')).rows.length,1);
  assert.equal((await asUser(pastor,'select * from people_overview')).rows.length,2);
  assert.equal((await asUser(other,'select * from people_overview')).rows.length,0);
  await assert.rejects(asUser(team,`update followups set assigned_to='${other}' where person_id='${one}'`),/Only leaders/);
  await asUser(team,`select save_followup('${one}','contacted',null,'Called visitor',now())`);
  assert.equal((await asUser(team,`select note from followup_notes where person_id='${one}'`)).rows[0].note,'Called visitor');
  assert.equal((await asUser(pastor,"select * from activity_logs where action='followup_updated'")).rows.length,1);
  await assert.rejects(asUser(team,`insert into activity_logs(user_id,action) values('${team}','login')`),/row-level security/);
  await assert.rejects(asUser(team,`select record_staff_session(gen_random_uuid(),'${team}','heartbeat',true,null,null,null)`),/permission denied/);
  await db.exec('reset role');
  await db.exec(fs.readFileSync('supabase/password-policy.sql','utf8'));
  await assert.rejects(db.query("update auth.users set encrypted_password='self-changed' where id=$1",[team]),/Staff passwords/);
  await db.exec('begin');
  await db.query("update auth.users set encrypted_password='admin-generated' where id=$1",[team]);
  await db.query("update auth.users set raw_app_meta_data=jsonb_build_object('staff_password_change','unique-admin-nonce') where id=$1",[team]);
  await db.exec('commit');
  await db.query("select record_staff_session('55555555-5555-4555-8555-555555555555',$1,'heartbeat',true,'127.0.0.1','Test city','Test browser')",[team]);
  await db.query("select record_staff_session('55555555-5555-4555-8555-555555555555',$1,'heartbeat',true,null,null,null)",[team]);
  assert.equal((await asUser(team,'select * from login_sessions')).rows.length,0);
  assert.equal((await asUser(pastor,'select * from login_sessions')).rows.length,1);
  assert.equal((await asUser(pastor,"select * from activity_logs where action='login'")).rows.length,1);
  await db.exec('reset role');
  await db.query('select set_staff_access($1,$2,false)',[admin,team]);
  assert.equal((await asUser(team,'select * from people')).rows.length,0);
  await assert.rejects(asUser(team,`select save_followup('${one}','completed',null,'',null)`),/Access denied/);
  await db.close();
});
