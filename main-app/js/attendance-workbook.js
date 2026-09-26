import ExcelJS from 'exceljs';
export async function attendanceBuffer(records,filters={}) {
 const workbook=new ExcelJS.Workbook();workbook.creator='Streams of Joy Johannesburg';
 const sheet=workbook.addWorksheet('Service attendance',{views:[{state:'frozen',ySplit:1,xSplit:2}]});
 const names=['Service date','Service','Event name','Men (adults)','Women (adults)','Teens','Children','Total attendance'];
 sheet.columns=[18,24,34,18,18,14,14,24].map(width=>({width}));
 const sorted=[...records].sort((a,b)=>a.service_date.localeCompare(b.service_date)||a.service_type.localeCompare(b.service_type));
 const total=r=>['men','women','teens','children'].reduce((n,k)=>n+Number(r[k]),0);
 sheet.addTable({name:'Attendance',ref:'A1',headerRow:true,style:{theme:'TableStyleMedium2',showRowStripes:true},columns:names.map(name=>({name,filterButton:true})),rows:sorted.map(r=>[new Date(r.service_date+'T00:00:00Z'),r.service_type,r.service_name||'',Number(r.men),Number(r.women),Number(r.teens),Number(r.children),total(r)])});
 sheet.getColumn(1).numFmt='dd mmm yyyy';for(let i=4;i<=8;i++)sheet.getColumn(i).numFmt='#,##0';
 const summary=workbook.addWorksheet('Report summary');summary.columns=[{width:36},{width:60}];
 const rows=[['Streams of Joy Johannesburg','Attendance report'],['From',filters.from||'All recorded dates'],['To',filters.to||'All recorded dates'],['Service selection',filters.service||'All services'],['Recorded services',records.length],['Men (adults)',records.reduce((n,r)=>n+Number(r.men),0)],['Women (adults)',records.reduce((n,r)=>n+Number(r.women),0)],['Teens',records.reduce((n,r)=>n+Number(r.teens),0)],['Children',records.reduce((n,r)=>n+Number(r.children),0)],['Total attendances',records.reduce((n,r)=>n+total(r),0)],['Average per recorded service',records.length?Math.round(records.reduce((n,r)=>n+total(r),0)/records.length*100)/100:0],['Reading this report','Counts are attendances, not unique people across services. Missing service entries are not treated as zero.'],['Filtering','Use the arrows in Service attendance. This summary describes the complete exported selection and does not change when you filter the other sheet.'],['Confidential','For authorised admins and pastors. Keep this file in approved church storage.']];rows.forEach(row=>summary.addRow(row));
 for(const tab of [sheet,summary])tab.eachRow((row,n)=>{row.height=n===1?34:42;row.eachCell(cell=>{cell.font={name:'Calibri',size:11,bold:n===1,color:{argb:n===1?'FFFFFFFF':'FF123458'}};cell.alignment={wrapText:true,vertical:'top'};if(n===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF123458'}};});});
 return workbook.xlsx.writeBuffer();
}
