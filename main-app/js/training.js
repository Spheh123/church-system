import {initProtectedPage,apiRequest,escapeHtml} from './auth.js';
const select=document.getElementById('guideSelect');
const content=document.getElementById('trainingContent');
let guides=[];
function render(){
 const guide=guides.find(g=>g.id===select.value);
 if(!guide)return;
 // Body is authored church training content returned by the authorised server.
 content.innerHTML=`<p class="eyebrow">Streams of Joy Johannesburg</p><h1>${escapeHtml(guide.title)}</h1><p>${escapeHtml(guide.intro)}</p>${guide.body}<hr><p>Training edition · 20 September 2026</p>`;
}
select.addEventListener('change',render);
document.getElementById('printGuide').addEventListener('click',()=>window.print());
initProtectedPage({ allowedRoles: ["admin","pastor","team","usher"],onReady:async()=>{
 try{
  ({guides}=await apiRequest('/.netlify/functions/training-manuals',{}));
  select.innerHTML=guides.map(g=>`<option value="${escapeHtml(g.id)}">${escapeHtml(g.title)}</option>`).join('');
  render();
 }catch(error){document.getElementById('trainingMessage').textContent=error.message;}
}});
