import { supabaseConfig } from '../shared/config.js';
// Only read health/settings and empty responses. Never prints visitor records.
for (const route of ['/auth/v1/health','/auth/v1/settings','/rest/v1/people?select=id&limit=0','/rest/v1/users?select=id&limit=0','/rest/v1/people_overview?select=person_id&limit=0']) {
  try {
    const response = await fetch(supabaseConfig.url+route,{headers:{apikey:supabaseConfig.anonKey,Authorization:'Bearer '+supabaseConfig.anonKey},signal:AbortSignal.timeout(15000)});
    const body = await response.json();
    console.log(route, response.status, route.includes('settings') ? {signup_disabled:body.disable_signup, email_enabled:body.external?.email} : Array.isArray(body) ? {returned_rows:body.length} : body);
  } catch(error) { console.log(route,error.message); }
}

if (process.argv.includes('--schema')) {
  const response = await fetch(supabaseConfig.url + '/rest/v1/', { headers: { apikey:supabaseConfig.anonKey, Authorization:'Bearer '+supabaseConfig.anonKey }, signal:AbortSignal.timeout(15000) });
  const spec = await response.json();
  for (const name of ['users','people','followups','followup_notes','activity_logs','people_overview']) console.log(name, Object.keys(spec.definitions?.[name]?.properties || {}));
}
