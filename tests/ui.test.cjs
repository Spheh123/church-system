const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
for (const [page,role] of [['dashboard','admin'],['dashboard','pastor'],['dashboard','coordinator'],['people','team'],['person','admin'],['person','team'],['followup','team'],['reports','pastor'],['attendance','usher'],['ministry','pastor']]) {
  test(`${page} renders real page nodes and controls for ${role}`, async () => {
    const dom = new JSDOM(fs.readFileSync(`main-app/${page}.html`,'utf8'), { url:`http://localhost/main-app/${page}.html?role=${role}&id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,runScripts:'outside-only' });
    const bundle = await esbuild.build({ entryPoints:[path.resolve(`main-app/js/${page}.js`)],bundle:true,format:'iife',write:false,plugins:[{name:'fixture',setup(b){b.onResolve({filter:/shared\/supabase\.js$/},()=>({path:path.resolve('tests/fixtures/supabase.js')}));}}] });
    dom.window.Response = Response; dom.window.AbortSignal = AbortSignal;
    const original = dom.window.document.querySelector('.page-content');
    dom.window.eval(bundle.outputFiles[0].text);
    for(let i=0;i<50&&!dom.window.document.querySelector('.shell-ready');i++) await new Promise(r=>setTimeout(r,10));
    await new Promise(r=>setTimeout(r,50));
    const document = dom.window.document;
    assert.equal(document.querySelector('.app-main .page-content'), original, 'Navigation must preserve DOM nodes and listeners');
    assert.ok(!document.querySelector('.auth-problem'),'Page must initialise without errors');
    if(page==='dashboard') {
      assert.match(document.getElementById('summaryCards').textContent,/2/);
      assert.match(document.getElementById('sessionHistory').textContent,/Preview Administrator/);
      assert.equal(document.querySelector('.admin-panel').classList.contains('hidden'),role==='coordinator');
    }
    if(page==='people') {
      const search=document.getElementById('searchInput');search.value='Another';search.dispatchEvent(new dom.window.Event('input'));
      assert.equal(document.querySelectorAll('#peopleList .card').length,1,'Search listener must survive shell setup');
    }
    if(page==='person') {
      assert.equal(document.getElementById('assignedToSelect').value,'22222222-2222-4222-8222-222222222222');
      assert.match(document.getElementById('openWhatsAppLink').href,/27820000000/);
      if(role==='team') assert.equal(document.getElementById('assignedToSelect').disabled,false);
    }
    if(page==='followup') assert.equal(document.getElementById('followupAssignmentScope').value,'mine');
    if(page==='attendance' && role==='usher') {
      assert.ok(document.getElementById('attendanceComparison').classList.contains('hidden'));
      assert.equal(document.getElementById('attendanceRows').textContent,'');
      assert.ok(!document.querySelector('.sidebar-nav').textContent.includes('Reports'));
      assert.match(document.querySelector('.sidebar-nav').textContent,/Submit attendance/);
    }
    dom.window.close();
  });
}
