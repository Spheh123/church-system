const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
const staffId='11111111-1111-4111-8111-111111111111';
const token = 'header.'+Buffer.from(JSON.stringify({session_id:'55555555-5555-4555-8555-555555555555'})).toString('base64url')+'.signature';
process.env.SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_ANON_KEY='public-test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY='server-test-key';
const event = (body, authenticated=true) => ({httpMethod:'POST',headers:authenticated?{authorization:'Bearer '+token}:{},body:JSON.stringify(body)});
const response = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('Staff cannot create users or reset another user password', async()=>{
  global.fetch=async url=>String(url).endsWith('/auth/v1/user')?response({id:staffId}):response([{id:staffId,role:'team',is_active:true}]);
  for(const file of ['admin-create-user','admin-reset-user-password','admin-manage-user','report-export']) {
    const result=await require('../netlify/functions/'+file).handler(event({}));
    assert.equal(result.statusCode,403);
  }
});
test('Unauthenticated requests cannot access admin or report endpoints',async()=>{
  global.fetch=async()=>{throw new Error('Must not call backend');};
  for(const file of ['admin-create-user','admin-reset-user-password','admin-manage-user','change-own-password','report-export','attendance-report']) assert.equal((await require('../netlify/functions/'+file).handler(event({},false))).statusCode,401);
});
test('Training content requires login and is limited by staff role',async()=>{
 const endpoint=require('../netlify/functions/training-manuals').handler;
 assert.equal((await endpoint(event({},false))).statusCode,401);
 for(const role of ['team','admin','pastor']){
  global.fetch=async url=>String(url).endsWith('/auth/v1/user')?response({id:staffId}):response([{id:staffId,role,is_active:true}]);
  const result=await endpoint(event({}));
  assert.equal(result.statusCode,200);
  const guides=JSON.parse(result.body).guides;
  assert.deepEqual(guides.map(g=>g.id),role==='team'?['team']:['admin','pastors','coordinator','team','ushers']);
 }
});

test('Failed account provisioning compensates only the newly created auth account',async()=>{
  const calls=[];
  global.fetch=async(url,options)=>{
    calls.push([url,options]);
    if(url.endsWith('/auth/v1/user'))return response({id:staffId});
    if(url.includes('/rest/v1/users?'))return response([{id:staffId,role:'admin',is_active:true}]);
    if(url.endsWith('/auth/v1/admin/users'))return response({id:'new-account-id'});
    if(url.endsWith('/rest/v1/users'))return response({message:'Profile write failed'},400);
    if(options.method==='DELETE')return response({});
    throw new Error('Unexpected call');
  };
  const result=await require('../netlify/functions/admin-create-user').handler(event({name:'Example Staff',email:'staff@example.test',role:'team'}));
  assert.equal(result.statusCode,400);
  const createBody=JSON.parse(calls.find(([url])=>url.endsWith('/auth/v1/admin/users'))[1].body);
  assert.match(createBody.app_metadata.staff_password_change,/^required:[a-f0-9-]{36}$/);
  assert.ok(calls.some(([url,o])=>url.endsWith('/new-account-id')&&o.method==='DELETE'));
});
test('Password reset uses a new protected nonce and never audits the password',async()=>{
  const calls=[];
  global.fetch=async(url,options)=>{
    calls.push([url,options]);
    if(url.endsWith('/auth/v1/user'))return response({id:staffId});
    if(url.includes('/rest/v1/users?'))return response([{id:staffId,role:'admin',is_active:true}]);
    return response({});
  };
  const result=await require('../netlify/functions/admin-reset-user-password').handler(event({userId:staffId}));
  assert.equal(result.statusCode,200);
  const generated=JSON.parse(result.body).password;
  assert.equal(generated.length,12);
  const update=JSON.parse(calls.find(([url])=>url.includes('/auth/v1/admin/users/'))[1].body);
  assert.match(update.app_metadata.staff_password_change,/^required:[a-f0-9-]{36}$/);
  assert.ok(!calls.find(([url])=>url.endsWith('activity_logs'))[1].body.includes(generated));
});
test('Staff can replace a required temporary password with a personal password',async()=>{
  const calls=[];
  global.fetch=async(url,options)=>{
    calls.push([String(url),options]);
    if(String(url).endsWith('/auth/v1/user'))return response({id:staffId,app_metadata:{staff_password_change:'required:old-marker',provider:'email'}});
    if(String(url).includes('/rest/v1/users?'))return response([{id:staffId,role:'team',is_active:true}]);
    return response({});
  };
  const endpoint=require('../netlify/functions/change-own-password').handler;
  const result=await endpoint(event({password:'MySecurePass7'}));
  assert.equal(result.statusCode,200);
  const updateCall=calls.find(([url])=>url.includes('/auth/v1/admin/users/'));
  const update=JSON.parse(updateCall[1].body);
  assert.equal(update.password,'MySecurePass7');
  assert.match(update.app_metadata.staff_password_change,/^completed:[a-f0-9-]{36}$/);
  assert.equal(update.app_metadata.provider,'email');
  const auditBody=calls.find(([url])=>url.endsWith('/activity_logs'))[1].body;
  assert.ok(!auditBody.includes('MySecurePass7'));
});
test('Personal password endpoint rejects weak passwords and completed resets',async()=>{
  const endpoint=require('../netlify/functions/change-own-password').handler;
  let marker='required:old';
  global.fetch=async url=>String(url).endsWith('/auth/v1/user')
    ?response({id:staffId,app_metadata:{staff_password_change:marker}})
    :response([{id:staffId,role:'team',is_active:true}]);
  assert.equal((await endpoint(event({password:'short'}))).statusCode,400);
  marker='completed:old';
  assert.equal((await endpoint(event({password:'MySecurePass7'}))).statusCode,403);
});
test('Existing staff accounts without a marker receive the one-time personal password setup',async()=>{
  const endpoint=require('../netlify/functions/change-own-password').handler;
  global.fetch=async url=>String(url).endsWith('/auth/v1/user')
    ?response({id:staffId,app_metadata:{provider:'email'}})
    :String(url).includes('/rest/v1/users?')
      ?response([{id:staffId,role:'pastor',is_active:true}])
      :response({});
  assert.equal((await endpoint(event({password:'MySecurePass7'}))).statusCode,200);
});
test('Form intake fails closed without a secret and rejects the old public bypass',async()=>{
  const intake=require('../netlify/functions/form-intake').handler;
  delete process.env.FORM_WEBHOOK_SECRET;
  assert.equal((await intake(event({full_name:'Example'},false))).statusCode,503);
  process.env.FORM_WEBHOOK_SECRET='test-secret';
  assert.equal((await intake(event({source:'public_form',full_name:'Example'},false))).statusCode,401);
});
test('Form intake sends only valid schema fields and a stable deduplication ID',async()=>{
  process.env.FORM_WEBHOOK_SECRET='test-secret';
  let captured;
  global.fetch=async(url,options)=>{captured={url,body:JSON.parse(options.body)};return response([{id:'new-visitor'}]);};
  const result=await require('../netlify/functions/form-intake').handler(event({secret:'test-secret',name:'Example',area_of_residence:'Midrand',source_id:'sheet:1:25'},false));
  assert.equal(result.statusCode,200);
  assert.equal(captured.body.area,undefined);
  assert.equal(captured.body.full_name,'Example');
  assert.match(captured.url,/on_conflict=source_id/);
  assert.equal(captured.body.secret,undefined);
});
test('Session location comes from the platform, not caller input',async()=>{
  let captured;
  global.fetch=async(url,options)=>{
    if(url.endsWith('/auth/v1/user'))return response({id:staffId});
    if(url.includes('/rest/v1/users?'))return response([{id:staffId,role:'team',is_active:true}]);
    captured=JSON.parse(options.body);return response({id:'test'});
  };
  const {default:handle}=await import('../netlify/functions/session.mjs');
  const result=await handle(new Request('https://example.test/session',{method:'POST',headers:{authorization:'Bearer '+token,'user-agent':'Test browser'},body:JSON.stringify({action:'heartbeat',active:true,ip:'forged',location:'forged'})}),{ip:'192.0.2.8',geo:{city:'Johannesburg',country:{name:'South Africa'}}});
  assert.equal(result.status,200);assert.equal(captured.p_ip,'192.0.2.8');assert.equal(captured.p_location,'Johannesburg, South Africa');
});

test('Sensitive report export is server-authorised and ordinary export omits care text',async()=>{
 const handler=require('../netlify/functions/report-export').handler;let sensitivePermission=false;const queries=[];
 global.fetch=async(url,options)=>{const u=String(url);if(u.endsWith('/auth/v1/user'))return response({id:staffId});if(u.includes('/users?'))return response([{id:staffId,role:'pastor',is_active:true,can_export_sensitive:sensitivePermission}]);if(u.includes('/people_overview?')){queries.push(u);return response([]);}if(u.includes('/activity_logs'))return response(null);throw new Error('Unexpected request');};
 assert.equal((await handler(event({sensitive:true}))).statusCode,403);assert.equal(queries.length,0);
 assert.equal((await handler(event({sensitive:false}))).statusCode,200);assert.ok(!queries[0].includes('prayer_points'));assert.ok(!queries[0].includes('followup_notes'));
 sensitivePermission=true;assert.equal((await handler(event({sensitive:true}))).statusCode,200);assert.ok(queries[1].includes('prayer_points'));assert.ok(!queries[1].includes('pastoral_notes'));
});

test('Attendance Excel is prepared on the server for pastors and Super Admins',async()=>{
 const ExcelJS=require('exceljs');const endpoint=require('../netlify/functions/attendance-report').handler;let role='pastor';
 global.fetch=async(url)=>{const u=String(url);if(u.endsWith('/auth/v1/user'))return response({id:staffId});if(u.includes('/users?'))return response([{id:staffId,role,is_active:true}]);if(u.includes('/service_attendance?'))return response([{service_date:'2026-09-21',service_type:'Sunday first',service_name:'',men:10,women:12,teens:3,children:5}]);if(u.includes('/activity_logs'))return response(null);throw new Error('Unexpected request '+u);};
 for(const allowedRole of ['pastor','super_admin']){role=allowedRole;const result=await endpoint(event({from:'2026-09-01',to:'2026-09-30',service:''}));assert.equal(result.statusCode,200);assert.equal(result.isBase64Encoded,true);const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(result.body,'base64'));assert.equal(book.getWorksheet('Service attendance').getCell('H2').value,30);assert.ok(book.getWorksheet('Service attendance').getTable('Attendance').table.columns.every(column=>column.filterButton));}
 role='team';assert.equal((await endpoint(event({}))).statusCode,403);
});
