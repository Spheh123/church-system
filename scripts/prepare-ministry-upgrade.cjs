const fs=require('node:fs');
const files=['ministry-operations.sql','pastoral-notes.sql','automatic-assignment.sql','export-permissions.sql','visitor-intake-journey.sql','contact-milestones.sql','ministry-finalize.sql'];
const backup=`create schema if not exists church_backup_20260920; revoke all on schema church_backup_20260920 from public,anon,authenticated; create table if not exists church_backup_20260920.users as table public.users; create table if not exists church_backup_20260920.followups as table public.followups; revoke all on all tables in schema church_backup_20260920 from public,anon,authenticated;`;
const sql='BEGIN;\n'+backup+'\n'+files.map(file=>'-- '+file+'\n'+fs.readFileSync('supabase/'+file,'utf8').replace(/^begin;\r?$/gm,'').replace(/^commit;\r?$/gm,'')).join('\n')+'\nCOMMIT;';
fs.writeFileSync('supabase/ministry-live-upgrade.sql',sql);
fs.mkdirSync('test-results/preview',{recursive:true});
fs.writeFileSync('test-results/preview/ministry-upgrade.txt',sql);
console.log('Prepared additive ministry upgrade.');
