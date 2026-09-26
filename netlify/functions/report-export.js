const {authorize,parseBody,api,audit,handler,HttpError}=require('./lib/server');
exports.handler=handler(async event=>{
 const {user,profile,token}=await authorize(event,['super_admin','admin','coordinator','pastor']);
 const input=parseBody(event),sensitive=input.sensitive===true;
 if(profile.role==='coordinator'&&!profile.can_export_reports)throw new HttpError(403,'A Super Admin or pastor must approve report access.');
 if(sensitive&&!['super_admin','admin'].includes(profile.role)&&!profile.can_export_sensitive)throw new HttpError(403,'Your administrator must grant sensitive-report export access.');
 const safe='person_id,full_name,gender,phone,email,area_of_residence,dob,occupation,marital_status,status,assigned_name,assigned_email,nsppdian,next_sunday,membership_interest,whatsapp_group,invite,created_at,last_contacted,next_followup_at,updated_at';
 let path='/rest/v1/people_overview?select='+safe+(sensitive?',prayer_points,service_feedback,invite_details,followup_notes':'')+'&order=person_id';
 for(const [name,operator] of [['start','gte'],['end','lte']])if(input[name]){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input[name])||!Number.isFinite(Date.parse(input[name])))throw new HttpError(400,'Invalid date.');
  path+='&created_at='+operator+'.'+encodeURIComponent(input[name]+(name==='start'?'T00:00:00+02:00':'T23:59:59.999+02:00'));
 }
 if(input.start&&input.end&&input.start>input.end)throw new HttpError(400,'Invalid date range.');
 if(input.status){if(!/^[a-z_]+$/.test(input.status))throw new HttpError(400,'Invalid status.');path+='&status=eq.'+input.status;}
 if(input.assignee){if(!/^[0-9a-f-]{36}$/i.test(input.assignee))throw new HttpError(400,'Invalid assignee.');path+='&assigned_to=eq.'+input.assignee;}
 const rows=[];for(let offset=0;;offset+=500){const page=await api(path+'&limit=500&offset='+offset,{token});rows.push(...page);if(page.length<500)break;if(rows.length>=20000)throw new HttpError(400,'Choose a smaller date range (fewer than 20,000 records).');}
 await audit(user.id,'report_exported',{summary:`Prepared ${rows.length} visitor records for Excel`,sensitive,count:rows.length});
 return {rows,sensitive};
});
