// LOCAL TEST DATA ONLY. Production builds never import this module.
const admin = { id:'11111111-1111-4111-8111-111111111111', name:'Preview Administrator', email:'admin@example.test', role:new URLSearchParams(location.search).get('role') || 'admin', is_active:true };
const person = { person_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', full_name:'Sample Visitor', email:'visitor@example.test', phone:'0820000000', area_of_residence:'Johannesburg', prayer_points:'Sample prayer request for family and guidance.', status:'not_called', assigned_to:admin.id, assigned_name:admin.name, created_at:new Date().toISOString(), updated_at:new Date().toISOString(), next_followup_at:null };
const rows = { users:[admin], people_overview:[person,{...person,person_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',full_name:'Another Sample Visitor',status:'completed',prayer_points:''}], activity_logs:[], followup_notes:[], login_sessions:[{id:'sample-session',users:admin,started_at:new Date(Date.now()-1800000).toISOString(),last_seen_at:new Date().toISOString(),active_seconds:840,was_active:true,ip_address:'192.0.2.1',location:'Johannesburg, South Africa (sample)',device:'Sample browser'}] };
const loginPage = location.pathname.endsWith('login.html');
const session = { user:admin,access_token:'LOCAL-PREVIEW-NOT-A-REAL-TOKEN' };
const notice = document.createElement('div'); notice.className='preview-notice'; notice.textContent='LOCAL DESIGN PREVIEW · SAMPLE DATA · NOT CONNECTED TO YOUR CHURCH DATABASE'; document.body.prepend(notice);
const originalFetch = window.fetch?.bind(window);
window.fetch = (url, options) => String(url).includes('/.netlify/functions/') ? Promise.resolve(new Response(JSON.stringify({ok:true,password:'PREVIEW-ONLY-NOT-A-REAL-PASSWORD'}),{status:200,headers:{'Content-Type':'application/json'}})) : originalFetch(url,options);
class Query {
  constructor(table) { this.table=table; this.filters=[]; this.values=null; }
  select(){return this;} order(){return this;} limit(){return this;} range(){return this;}
  eq(k,v){this.filters.push(r=>r[k]===v);return this;}
  in(k,vs){this.filters.push(r=>vs.includes(r[k]));return this;}
  insert(values){this.values=values;this.action='insert';return this;}
  update(values){this.values=values;this.action='update';return this;}
  single(){this.one=true;return this;} maybeSingle(){return this.single();}
  then(resolve){
    let data=(rows[this.table] || []).filter(r=>this.filters.every(f=>f(r)));
    if(this.action==='insert'){ rows[this.table]?.push(this.values); }
    if(this.action==='update') data.forEach(r=>Object.assign(r,this.values));
    return Promise.resolve({data:this.one?data[0]:data,error:null}).then(resolve);
  }
}
export const supabase = {
  auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:loginPage?null:session}}),signInWithPassword:async()=>({error:{message:'This is a local design preview. Live sign-in is not enabled here.'}}),signOut:async()=>({error:null})},
  from:table=>new Query(table),
  rpc:async(name,args)=>{if(name==='save_followup')Object.assign(person,{status:args.p_status,assigned_to:args.p_assigned,next_followup_at:args.p_due});return {data:null,error:null};},
  channel:()=>({on(){return this;},subscribe(callback){callback?.('SUBSCRIBED');return this;}}),
  removeChannel:()=>{},
};
