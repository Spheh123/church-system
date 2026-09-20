const fs = require('node:fs');
const files=['live-compatibility.sql','schema.sql','upgrade.sql','profile-edit.sql','password-policy.sql'];
const parts=files.map(file=>'-- SOURCE: '+file+'\n'+fs.readFileSync('supabase/'+file,'utf8').replace(/^begin;\r?$/gm,'').replace(/^commit;\r?$/gm,''));
const sql='-- Church workspace upgrade: private backup, compatibility, security and workflows.\nBEGIN;\n'+parts.join('\n')+'\nCOMMIT;\n';
fs.writeFileSync('supabase/live-upgrade.sql',sql);
fs.mkdirSync('test-results/preview',{recursive:true});
fs.writeFileSync('test-results/preview/review-upgrade.txt',sql);
console.log('Prepared supabase/live-upgrade.sql ('+sql.length+' characters)');
