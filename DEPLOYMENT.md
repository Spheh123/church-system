# Go-live: Streams of Joy Johannesburg

The source is prepared locally. Do not call this live until the database upgrade,
Netlify deploy, and real-account checks below have succeeded.

## Existing site and data

- Team site: https://sojjdatabasesoftware.netlify.app/main-app/login.html
- Supabase project: `pyqwigkelwavbgbiwfhh` (restored during this repair).
- Keep the current Google Form, response spreadsheet, and any existing Firebase
  sync running. Nothing in this code deployment changes those external scripts.
- Inspect the live schema and export the existing tables before the upgrade.
  Keep exports privately; do not put visitor records in Git or the published site.

## Database

For an existing installation with the supplied base schema, run in this order:

1. `supabase/upgrade.sql`
2. `supabase/profile-edit.sql`
3. `supabase/password-policy.sql`

For a new database, run `supabase/schema.sql` first, then the three upgrades.
Do not rerun the old base schema by itself on an upgraded project: it contains
the original permissive policies which the upgrade replaces.

The upgrade preserves people, notes and logs; it rebuilds the overview view,
retains all old follow-up statuses, adds the new statuses, enables Realtime,
and restricts team access to assigned people. Existing custom schema changes
must be inspected first. The scripts do not import or remove Firebase records.

Disable public signup in Supabase Authentication (confirmed disabled during
the health check). Keep email/password enabled. Set Site URL to the team site.

Existing admin accounts can be retained. If no admin profile exists, create the
first Auth user privately in the Supabase dashboard and insert its exact UUID:

```sql
insert into public.users(id,name,email,role)
values ('AUTH-USER-UUID','Administrator','YOUR-ADMIN-EMAIL','admin');
```

### Password rule

There is no staff signup, password-change form, or reset email flow in this app.
Admins generate passwords through the server endpoints. The strict database
guard also rejects direct Auth password updates for registered staff unless a
protected app-metadata nonce changes in the same transaction. Only the admin
server API can set that nonce. Passwords are not stored in activity logs.

This guard touches Supabase's managed Auth schema. **Before admitting staff,
verify it against the deployed Auth version using a disposable staff account:**
admin reset succeeds; direct self-change fails; login with the generated
password succeeds. Retest after Auth hashing/provider changes. Normal provider
rehashing also changes the hash and may require adapting this guard. The SQL
file includes an emergency rollback statement; removing it relaxes the strict
password rule. Dashboard password resets must use an equivalent nonce change,
or use the church app's admin reset control.

## Netlify

Use a Git-based deploy, not a static folder drag-and-drop: serverless functions
are required for passwords, sessions, form intake, and staff administration.

The repository config sets:

- Build: `node scripts/build.cjs`
- Publish: `dist`
- Functions: `netlify/functions`
- Node: 24
- Package manager: pinned pnpm with a lockfile

Set these environment variables in Netlify (Builds AND Functions for URL/anon;
Functions only for secrets). Never paste secret keys into chat or Git:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Restored project's HTTPS URL |
| `SUPABASE_ANON_KEY` | Public anon/publishable key; safe for the built browser client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service-role/secret key |
| `FORM_WEBHOOK_SECRET` | Shared secret for the optional Google Form bridge |
| `GOOGLE_SHEETS_WEBHOOK_URL` | Optional report receiver's Apps Script `/exec` URL |
| `GOOGLE_SHEETS_REPORT_SECRET` | Separate report receiver secret |
| `DAILY_REPORT_ENABLED` | `true` only after testing reports; otherwise leave unset |

The build bundles a pinned Supabase client locally, removing the external
JavaScript CDN dependency. Only frontend assets go into `dist`; source SQL,
tests, server functions and secrets are not published as static files.

## Visitor intake and historical data

First submit a labelled test through the CURRENT Google Form and confirm where
it arrives. Do not replace a working Firebase bridge before reconciling counts.

If a Supabase mirror is needed, add `apps-script/google-form-sync.gs` as an
additional function in the existing response spreadsheet's script, set its
`FORM_WEBHOOK_SECRET` property, and add a spreadsheet form-submit trigger for
`syncVisitorToChurchWorkspace`. It uses the sheet ID and row number as a stable
source ID, so retries do not duplicate that submission. Never sort/move source
rows while replaying them. Keep original timestamps and compare record counts
before switching intake. No historical import has been run automatically.

The standalone `/intake` form remains available. It uses the existing public
RPC with validation. It is not a replacement for the current Google Form. If
it is promoted publicly, add provider bot protection/rate limiting first.

## Reports

Reports download as formatted .xlsx workbooks, with a filterable table, frozen name/header, all captured visitor fields and Johannesburg timestamps. ExcelJS is loaded only when exporting. Google Sheets reporting and its daily schedule have been retired; the inbound Google Form integration is unchanged.

## Access from the church website

Add this to the existing footer links beside Privacy Policy and Terms:

```html
<a href="https://sojjdatabasesoftware.netlify.app/main-app/login.html"
   rel="nofollow">Team Login</a>
```

Visitors still use the main church website normally. Staff use **footer → Team
Login → assigned email and generated password**. The link is discreet; actual
protection is authentication and database access rules. A custom subdomain is
optional and requires a separate DNS change.

## Required live checks

1. Admin signs in. Existing people and notes are present.
2. Admin creates a test team user and pastor, sharing passwords privately.
3. Admin assigns a test visitor to the team user. Team sees only its assignments.
4. Team saves status, due date and notes. Admin and pastor see changes live.
5. Pastor can see login history and reports, but cannot create/reset/disable users.
6. Login history shows server IP, available approximate city/country, device,
   sign-in/last-seen, estimated active duration and explicit logout. Closed-tab
   sessions become disconnected; there is no invented exact logout time.
7. Admin disables the team account. New reads and updates are refused by RLS.
8. Verify the strict password guard as described above.
9. Test current Google Form intake and an Excel export and its column filters.
10. Test phone layout and logout; then add/deploy the footer link.

## Operations and limits

- The dashboard displays the latest 100 login sessions and latest 25 activity
  events; the database retains older history.
- Viewed-record events and active-time signals come from the browser. Database
  edits, assignments and notes are audited by database triggers. Browser
  telemetry is an estimate, not proof of continuous work.
- IP geolocation is approximate and may reflect a mobile carrier or VPN.
- Back up people, followups, notes, users, activity_logs and login_sessions
  privately using Supabase's export/backup facilities; test restoration.
- No automatic deletion of historical records or logs is enabled.
- Supabase's Free plan can pause after inactivity; restore it in the dashboard
  if this happens again. Free plans have usage limits and no promise of
  uninterrupted service: https://supabase.com/pricing
- Netlify's free-tier usage must also be monitored. No paid plan was selected.

## Local validation

`pnpm install`, `pnpm test`, `pnpm build`.

`node scripts/dev.cjs` serves the built static frontend for visual checks; it
does not emulate Netlify functions. Use Netlify's development environment or a
deploy preview for end-to-end server testing. Local fixture previews are built
under `test-results/preview` and clearly labelled; never deploy that directory.
# Live installation update — 20 September 2026

The inspected legacy Supabase installation has been upgraded using `supabase/live-upgrade.sql`, generated by `node scripts/prepare-upgrade.cjs`. It includes compatibility repairs before the base schema and security upgrades. Do not run the base schema alone against production: it contains older policies that the upgrade replaces. The private `church_backup_20260919` schema holds the four original tables; it is not a scheduled backup service.

Netlify requires the esbuild approval in `pnpm-workspace.yaml`. Training manuals are served by the authenticated `training-manuals` function; regenerate its private content with `node scripts/build-manuals.cjs`. Staff use `main-app/training.html`. Admins/pastors receive all guides, and team members receive only their guide. Old public manual routes redirect to the protected page, and the build excludes old static manuals. The public `/main-app/intake` route remains available without login. It stores service date and visitor agreement in service feedback and only inserts through the public submission RPC. It cannot list visitors. The browser prevents concurrent double-click submissions but cannot guarantee deduplication after an ambiguous network failure; the usher must ask a leader to check before retrying.
