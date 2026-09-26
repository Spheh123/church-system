const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const {PGlite}=require('@electric-sql/pglite');
test('Ministry permissions isolate ushers, restrict notes, protect attendance and balance assignment',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
 for(const file of ['schema','upgrade','usher-role','role-hierarchy-values','ministry-operations','pastoral-notes','automatic-assignment','export-permissions','visitor-intake-journey','contact-milestones','attendance-leaders-only','shared-followup-workspace'])await db.exec(fs.readFileSync('supabase/'+file+'.sql','utf8').replace('create extension if not exists pgcrypto;',''));
 const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'];
 for(const [i,role] of ['admin','pastor','team','usher','team'].entries()){await db.query('insert into auth.users values($1)',[ids[i]]);await db.query('insert into users(id,name,email,role)values($1,$2,$3,$4)',[ids[i],role,role+i+'@test.invalid',role]);}
 await db.exec("insert into people(full_name) values('One'),('Two'),('Three')");
 const persons=(await db.query('select id from people order by id')).rows;
 async function as(i,sql){await db.exec(`reset role;select set_config('request.jwt.claim.sub','${ids[i]}',false);select set_config('request.jwt.claim.role','authenticated',false);set role authenticated;`);return db.query(sql);}
 assert.equal((await as(3,'select * from people')).rows.length,0);
 assert.equal((await as(2,'select * from people')).rows.length,3,'Follow-up workers see every incoming visitor');
 await assert.rejects(as(3,"select assign_waiting_visitors()"),/Leader access/);
 await as(0,`select set_assignment_availability('${ids[2]}',true)`);await as(0,`select set_assignment_availability('${ids[4]}',true)`);
 assert.equal((await as(0,'select assign_waiting_visitors() as count')).rows[0].count,3);
 assert.equal((await as(0,'select assign_waiting_visitors() as count')).rows[0].count,0);
 await db.exec('reset role');
 await db.exec("select set_config('request.jwt.claim.sub','',false);select set_config('request.jwt.claim.role','anon',false);set role anon;");
 const intake=await db.query(`select submit_public_visit(current_date,'{"full_name":"Intake test"}'::jsonb) as id`);
 assert.equal((await as(0,`select * from visitor_events where person_id='${intake.rows[0].id}'`)).rows.length,1);
 const automatic=(await as(0,`select assigned_to from followups where person_id='${intake.rows[0].id}'`)).rows[0];assert.ok(automatic.assigned_to);
 const workloads=(await as(0,'select assigned_to,count(*)::int as n from followups group by assigned_to')).rows.map(x=>x.n).sort();assert.deepEqual(workloads,[2,2]);
 await as(0,`insert into pastoral_notes(person_id,note,created_by)values('${persons[0].id}','Restricted','${ids[0]}')`);
 assert.equal((await as(1,'select * from pastoral_notes')).rows.length,1);assert.equal((await as(2,'select * from pastoral_notes')).rows.length,0);assert.equal((await as(3,'select * from pastoral_notes')).rows.length,0);
 const saved=await as(3,"select save_attendance(null,null,current_date,'Sunday first','',10,12,3,4) as id");const service=saved.rows[0].id;
 await assert.rejects(as(3,"select save_attendance(null,null,current_date,'Sunday first','',10,12,3,4)"),/duplicate/);
 assert.equal((await as(3,'select * from service_attendance')).rows.length,0);
 assert.equal((await as(2,'select * from service_attendance')).rows.length,0);
 await assert.rejects(as(3,`select save_attendance('${service}',1,current_date,'Sunday first','',11,12,3,4)`),/Ask an administrator/);
 await as(3,"select save_attendance(null,null,current_date,'Wednesday','',1,2,3,4)");
 await as(0,`select save_attendance('${service}',1,current_date,'Sunday first','',11,12,3,4)`);
 await assert.rejects(as(0,`select save_attendance('${service}',1,current_date,'Sunday first','',12,12,3,4)`),/Someone changed/);
 await assert.rejects(as(2,"select save_attendance(null,null,current_date,'Wednesday','',1,1,1,1)"),/Attendance access/);
 await as(2,`select save_followup('${persons[0].id}','not_called','${ids[4]}','Handed over to another worker',null)`);
 assert.equal((await as(4,`select assigned_to from followups where person_id='${persons[0].id}'`)).rows[0].assigned_to,ids[4]);
 assert.equal((await as(1,`select * from service_attendance where id='${service}'`)).rows[0].men,11);
 }finally{await db.close();}
});
