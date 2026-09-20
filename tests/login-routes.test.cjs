const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const esbuild=require('esbuild');
const fs=require('node:fs');
test('Login binds on both HTML and Netlify pretty URLs',async()=>{
 const bundle=await esbuild.build({entryPoints:['main-app/js/auth.js'],bundle:true,format:'iife',write:false,plugins:[{name:'signed-out',setup(b){
  b.onResolve({filter:/shared\/supabase\.js$/},()=>({path:'signed-out',namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const supabase={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{}})}};'}));
 }}]});
 for(const name of ['login','login.html']){
  const dom=new JSDOM(fs.readFileSync('main-app/login.html','utf8'),{url:`https://example.test/main-app/${name}`,runScripts:'outside-only'});
  dom.window.eval(bundle.outputFiles[0].text);
  assert.equal(dom.window.document.getElementById('loginForm').dataset.bound,'true');
  dom.window.close();
 }
});
