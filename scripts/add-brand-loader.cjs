const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve('main-app');
for(const name of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){
 const file=path.join(root,name);let html=fs.readFileSync(file,'utf8');
 if(!html.includes('brand-loader.css'))html=html.replace('</head>','  <link rel="stylesheet" href="assets/brand-loader.css">\n  <script src="assets/brand-loader.js" defer></script>\n</head>');
 html=html.replaceAll('assets/church-logo.png','assets/church-logo-original.png');
 fs.writeFileSync(file,html);
}
const config='shared/config.js';fs.writeFileSync(config,fs.readFileSync(config,'utf8').replaceAll('assets/church-logo.png','assets/church-logo-original.png'));
