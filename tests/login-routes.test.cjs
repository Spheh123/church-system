const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const esbuild=require('esbuild');
const fs=require('node:fs');
test('Login binds and resolves assets on both clean and HTML URLs',async()=>{
 const bundle=await esbuild.build({entryPoints:['main-app/js/auth.js'],bundle:true,format:'iife',write:false,plugins:[{name:'signed-out',setup(b){
  b.onResolve({filter:/shared\/supabase\.js$/},()=>({path:'signed-out',namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const supabase={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{}})}};'}));
 }}]});
 for(const pathname of ['/login','/main-app/login.html']){
  const dom=new JSDOM(fs.readFileSync('main-app/login.html','utf8'),{url:`https://care.streamsofjoyjohannesburg.org${pathname}`,runScripts:'outside-only'});
  dom.window.eval(bundle.outputFiles[0].text);
  assert.equal(dom.window.document.getElementById('loginForm').dataset.bound,'true');
  assert.equal(new URL(dom.window.document.querySelector('link[href="css/styles.css"]').href).pathname,'/main-app/css/styles.css');
  assert.equal(new URL(dom.window.document.querySelector('script[src="js/login.js"]').src).pathname,'/main-app/js/login.js');
  dom.window.close();
 }
});
