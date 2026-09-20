// Apply only this release to the index, retaining unrelated working-tree edits.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const repo=path.resolve('../SOJJ-website');
const git=(args,input)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',input});
if(git(['diff','--cached','--name-only']).trim())throw new Error('Existing staged changes: stop to preserve them.');
const transform=html=>{
 if(!html.includes('assets/brand/brand-loader.css'))html=html.replace('</head>','  <link rel="stylesheet" href="assets/brand/brand-loader.css">\n  <script src="assets/brand/brand-loader.js" defer></script>\n</head>');
 return html.replaceAll('images/SOJJ-Monochrome-Logo-White.png','assets/brand/church-logo-original.png');
};
for(const file of git(['ls-files','*.html']).trim().split('\n').filter(f=>f&&!f.includes('/'))){
 const original=git(['show','HEAD:'+file]);const updated=transform(original);
 if(updated===original)continue;
 const full=path.join(repo,file);fs.writeFileSync(full,transform(fs.readFileSync(full,'utf8')));
 const hash=git(['hash-object','-w','--stdin'],updated).trim();git(['update-index','--cacheinfo','100644',hash,file]);
}
const dest=path.join(repo,'assets/brand');fs.mkdirSync(dest,{recursive:true});
for(const name of ['brand-loader.css','brand-loader.js','church-logo-original.png'])fs.copyFileSync('main-app/assets/'+name,path.join(dest,name));
git(['add','assets/brand']);
console.log(git(['diff','--cached','--stat']));
