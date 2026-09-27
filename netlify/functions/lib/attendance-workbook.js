const ExcelJS = require('exceljs');

async function attendanceBuffer(records, filters = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Streams of Joy Johannesburg';
  const sheet = workbook.addWorksheet('Service attendance', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
  const names = ['Service date','Service','Event name','Men (adults)','Women (adults)','Teens','Children','Total attendance'];
  sheet.columns = [18,24,34,18,18,14,14,24].map(width => ({ width }));
  const sorted = [...records].sort((a,b) => a.service_date.localeCompare(b.service_date) || a.service_type.localeCompare(b.service_type));
  const total = row => ['men','women','teens','children'].reduce((sum,key) => sum + Number(row[key] || 0), 0);
  sheet.addTable({ name:'Attendance', ref:'A1', headerRow:true, style:{theme:'TableStyleMedium2',showRowStripes:true},
    columns:names.map(name => ({name,filterButton:true})),
    rows:sorted.map(row => [new Date(row.service_date+'T00:00:00Z'),row.service_type,row.service_name||'',Number(row.men),Number(row.women),Number(row.teens),Number(row.children),total(row)]) });
  sheet.getColumn(1).numFmt = 'dd mmm yyyy';
  for (let column = 4; column <= 8; column += 1) sheet.getColumn(column).numFmt = '#,##0';
  const summary = workbook.addWorksheet('Report summary');
  summary.columns = [{width:36},{width:60}];
  [['Streams of Joy Johannesburg','Attendance report'],['From',filters.from||'All recorded dates'],['To',filters.to||'All recorded dates'],['Service selection',filters.service||'All services'],['Recorded services',records.length],['Men (adults)',records.reduce((n,r)=>n+Number(r.men),0)],['Women (adults)',records.reduce((n,r)=>n+Number(r.women),0)],['Teens',records.reduce((n,r)=>n+Number(r.teens),0)],['Children',records.reduce((n,r)=>n+Number(r.children),0)],['Total attendances',records.reduce((n,r)=>n+total(r),0)],['Average per recorded service',records.length?Math.round(records.reduce((n,r)=>n+total(r),0)/records.length*100)/100:0],['Reading this report','Counts are attendances, not unique people across services. Missing service entries are not treated as zero.'],['Filtering','Use the arrows in Service attendance. This summary describes the complete exported selection and does not change when you filter the other sheet.'],['Confidential','For authorised Super Admins and pastors. Keep this file in approved church storage.']].forEach(row => summary.addRow(row));
  for (const tab of [sheet,summary]) tab.eachRow((row,number) => { row.height=number===1?34:42; row.eachCell(cell => { cell.font={name:'Calibri',size:11,bold:number===1,color:{argb:number===1?'FFFFFFFF':'FF123458'}};cell.alignment={wrapText:true,vertical:'top'};if(number===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF123458'}}; }); });
  return workbook.xlsx.writeBuffer();
}

module.exports = { attendanceBuffer };
