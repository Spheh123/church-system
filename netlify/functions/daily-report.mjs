import reports from './lib/reports.js';
// 05:00 UTC = 07:00 Johannesburg. Disabled until the operator opts in.
export const config = { schedule: '0 5 * * *' };
export default async () => {
  if (process.env.DAILY_REPORT_ENABLED !== 'true') return;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  await reports.sendReport(await reports.reportRows(), 'daily-' + day);
};
