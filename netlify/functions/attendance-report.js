const { authorize, parseBody, api, audit, json, HttpError } = require('./lib/server');
const { attendanceBuffer } = require('./lib/attendance-workbook');

exports.handler = async event => {
  try {
    if (event.httpMethod !== 'POST') return json(405,{error:'Method not allowed'});
    const { user, token } = await authorize(event,['super_admin','admin','pastor']);
    const input = parseBody(event);
    const validDate = value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
    if (!validDate(input.from) || !validDate(input.to) || input.from && input.to && input.from > input.to) throw new HttpError(400,'Choose a valid date range.');
    const services = ['Sunday first','Sunday second','Wednesday','All-night prayer','Special event'];
    if (input.service && !services.includes(input.service)) throw new HttpError(400,'Choose a valid service.');
    let path = '/rest/v1/service_attendance?select=*&order=service_date.asc';
    if (input.from) path += '&service_date=gte.' + input.from;
    if (input.to) path += '&service_date=lte.' + input.to;
    if (input.service) path += '&service_type=eq.' + encodeURIComponent(input.service);
    const rows=[];
    for(let offset=0;;offset+=500){const page=await api(path+'&limit=500&offset='+offset,{token});rows.push(...page);if(page.length<500)break;if(rows.length>=20000)throw new HttpError(400,'Choose a smaller date range.');}
    if (!rows.length) throw new HttpError(400,'No recorded services match this selection.');
    const workbook = await attendanceBuffer(rows,{from:input.from,to:input.to,service:input.service||'All services'});
    await audit(user.id,'report_exported',{summary:`Prepared ${rows.length} attendance entries for Excel`,report:'attendance',count:rows.length,from:input.from||null,to:input.to||null,service:input.service||null});
    return { statusCode:200, isBase64Encoded:true, headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="SOJJ-attendance.xlsx"','Cache-Control':'no-store'}, body:Buffer.from(workbook).toString('base64') };
  } catch (error) {
    console.error('Attendance report failed:',error.status||503,error.message);
    return json(error.status||503,{error:error.status?error.message:'Attendance report is temporarily unavailable.'});
  }
};
