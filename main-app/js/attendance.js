import { supabase } from '../../shared/supabase.js';
import { initProtectedPage, readAllRows, escapeHtml, setMessage, subscribeTables } from './auth.js';
import { logActivity } from './activity.js';
const $=id=>document.getElementById(id);
let records=[], editing=null, isLeader=false;
const categories=['Men','Women','Teens','Children'];
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
$('serviceDate').value=today; $('serviceDate').max=today;
$('trendFrom').value=today.slice(0,7)+'-01'; $('trendTo').value=today;
function total(row){return ['men','women','teens','children'].reduce((n,k)=>n+Number(row[k]||0),0);}
function reset(){editing=null;$('attendanceForm').reset();$('serviceDate').value=today;$('entryTitle').textContent='Record a service';$('serviceDate').disabled=false;$('serviceType').disabled=false;$('serviceName').disabled=false;$('liveTotal').textContent='Total: 0';}
$('cancelEdit').onclick=reset;
$('attendanceForm').oninput=()=>{$('liveTotal').textContent='Total: '+categories.reduce((n,k)=>n+Number($('count'+k).value||0),0);};
$('attendanceForm').onsubmit=async event=>{event.preventDefault();event.submitter.disabled=true;try{
 const counts=categories.map(k=>Number($('count'+k).value));
 if(counts.some(n=>!Number.isInteger(n)||n<0))throw new Error('Enter whole, non-negative headcounts.');
 const {error}=await supabase.rpc('save_attendance',{p_id:editing?.id||null,p_version:editing?.version||null,p_date:$('serviceDate').value,p_type:$('serviceType').value,p_name:$('serviceName').value.trim(),p_men:counts[0],p_women:counts[1],p_teens:counts[2],p_children:counts[3]});
 if(error)throw error;reset();await load();setMessage($('attendanceMessage'),'Attendance saved. Leaders can now view these figures.','success');
 }catch(error){setMessage($('attendanceMessage'),/duplicate key/.test(error.message)?(isLeader?'This service already has an entry. Find it below and choose Correct counts.':'This service already has an entry. Ask an administrator to check or correct it.'):error.message,'error');}finally{event.submitter.disabled=false;}};
function render(){
 const from=$('trendFrom').value,to=$('trendTo').value,type=$('trendService').value,metric=$('trendMetric').value,group=$('trendGroup').value;
 if(from&&to&&from>to){setMessage($('attendanceMessage'),'Choose an end date on or after the start date.','error');return;}
 const shown=records.filter(r=>(!from||r.service_date>=from)&&(!to||r.service_date<=to)&&(!type||r.service_type===type));
 $('attendanceSummary').innerHTML=`<article class="summary-pill"><strong>${shown.length}</strong><div>Recorded services</div></article><article class="summary-pill"><strong>${shown.reduce((n,r)=>n+total(r),0)}</strong><div>Total attendances</div></article><article class="summary-pill"><strong>${shown.length?Math.round(shown.reduce((n,r)=>n+total(r),0)/shown.length):0}</strong><div>Average per recorded service</div></article>`;
 const groups=new Map();for(const r of shown){const key=group==='month'?r.service_date.slice(0,7):group==='service'?r.service_type:r.service_date;groups.set(key,(groups.get(key)||0)+(metric==='total'?total(r):Number(r[metric])));}
 const max=Math.max(1,...groups.values());
 $('attendanceChart').innerHTML=groups.size?[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([key,n])=>`<div class="attendance-bar"><span>${escapeHtml(key)} — <strong>${n}</strong></span><meter min="0" max="${max}" value="${n}" aria-label="${escapeHtml(key)}: ${n}">${n}</meter></div>`).join(''):'<p>No recorded services in this range. Missing entries are not treated as zero attendance.</p>';
 $('attendanceRows').innerHTML=`<table class="attendance-table"><thead><tr>${['Date','Service','Men (adults)','Women (adults)','Teens','Children','Total',''].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${shown.map(r=>`<tr><td>${escapeHtml(r.service_date)}</td><td>${escapeHtml(r.service_type)} ${escapeHtml(r.service_name)}</td><td>${r.men}</td><td>${r.women}</td><td>${r.teens}</td><td>${r.children}</td><td><strong>${total(r)}</strong></td><td><button type="button" data-edit="${r.id}" class="secondary-action">Correct counts</button></td></tr>`).join('')}</tbody></table>`;
 $('attendanceRows').querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>{editing=records.find(r=>r.id===button.dataset.edit);$('entryTitle').textContent='Correct recorded counts';$('serviceDate').value=editing.service_date;$('serviceType').value=editing.service_type;$('serviceName').value=editing.service_name;for(const key of categories)$('count'+key).value=editing[key.toLowerCase()];for(const key of ['serviceDate','serviceType','serviceName'])$(key).disabled=true;$('attendanceForm').scrollIntoView({behavior:'smooth'});});
}
async function load(){if(!isLeader)return;records=await readAllRows('service_attendance','*','service_date');render();}
for(const id of ['trendFrom','trendTo','trendService','trendMetric','trendGroup'])$(id).onchange=render;
initProtectedPage({allowedRoles:['super_admin','admin','pastor','usher'],onReady:async({profile})=>{isLeader=['super_admin','admin','pastor'].includes(profile.role);$('attendanceComparison').classList.toggle('hidden',!isLeader);if(isLeader){await load();subscribeTables(['service_attendance'],load);}else{$('cancelEdit').textContent='Clear form';}}});

$('exportAttendance').onclick=async()=>{if(!isLeader)return;const button=$('exportAttendance');button.disabled=true;try{const from=$('trendFrom').value,to=$('trendTo').value,type=$('trendService').value;if(from&&to&&from>to)throw new Error('Choose a valid date range.');await load();const selected=records.filter(r=>(!from||r.service_date>=from)&&(!to||r.service_date<=to)&&(!type||r.service_type===type));if(!selected.length)throw new Error('No recorded services match this selection.');const {attendanceBuffer}=await import('./attendance-workbook.js');const bytes=await attendanceBuffer(selected,{from,to,service:type||'All services'});const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download='SOJJ-attendance-'+today+'.xlsx';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);await logActivity('report_exported',null,{summary:'Exported '+selected.length+' service attendance entries to Excel',report:'attendance',from,to,service:type});setMessage($('attendanceMessage'),'Excel report downloaded. Use the heading arrows to filter in Excel.','success');}catch(error){setMessage($('attendanceMessage'),error.message,'error');}finally{button.disabled=false;}};
