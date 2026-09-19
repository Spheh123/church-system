# System overview

The existing implementation uses Supabase, not Firebase. Google Form and any existing Firebase intake must remain intact until their live data flow is verified. See DEPLOYMENT.md.

Admin: creates accounts, generates/resets passwords, disables/restores access, assigns people, corrects profiles, reads all care records, reports and audit/session history.

Pastor: reads church care records, assigns follow-ups, corrects profiles, views reports and audit/session history. Cannot create accounts, reset passwords or disable access.

Team: reads only assigned people and related notes/history, updates follow-up statuses/dates and adds notes. Cannot reassign people or view staff login history.

Database policies enforce permissions independently of the UI. Server functions validate the Supabase user and current active role before privileged work. The browser receives only the public anon key.

Login sessions use the verified Auth session ID and server timestamps; IP/location come from Netlify context. Active duration is an estimate based on recent browser interaction. Sessions without explicit logout are labelled disconnected after their heartbeats stop.

The strict password-policy trigger requires an admin-controlled metadata change in the same transaction as a password update. It must be verified on the hosted Auth version before staff rollout and after provider upgrades.
