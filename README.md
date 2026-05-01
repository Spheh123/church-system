# Streams of Joy Johannesburg Follow-Up System

Production-ready church follow-up management system built with:

- Frontend: HTML, CSS, modular JavaScript
- Backend: Supabase Auth, Postgres, Realtime
- Hosting: Netlify
- Intake source: Google Form -> Apps Script -> Netlify Function -> Supabase

## Core architecture

1. Google Form collects the visitor response.
2. Google Sheets / Apps Script sends the normalized row to `/.netlify/functions/form-intake`.
3. Netlify function writes the person into Supabase `people`.
4. A database trigger creates the matching `followups` row automatically.
5. The frontend reads the joined `people_overview` view and updates live through Supabase Realtime.

## Main folders

- `main-app/` static frontend pages and JS modules
- `shared/` shared Supabase client and app configuration
- `netlify/functions/` secure serverless functions for admin user creation and form intake
- `supabase/schema.sql` database tables, view, triggers, and RLS
- `apps-script/google-form-sync.gs` Apps Script template for Google Form syncing

## Database objects

Main tables:

- `users`
- `people`
- `followups`
- `followup_notes`
- `activity_logs`

Joined view:

- `people_overview`

## Supabase setup

1. Create a Supabase project.
2. Open SQL Editor and run [schema.sql](/C:/Users/DELL/Downloads/My%20webistes/Streams-Of-Joy-Johannesburg/church-system/supabase/schema.sql).
3. In Authentication:
   - enable Email auth
   - disable public signup
4. Create your first admin user in Supabase Auth manually.
5. Insert the same user into `public.users` with role `admin`.

## Frontend config

Update [config.js](/C:/Users/DELL/Downloads/My%20webistes/Streams-Of-Joy-Johannesburg/church-system/shared/config.js):

- `supabaseConfig.url`
- `supabaseConfig.anonKey`

## Netlify environment variables

Add these in Netlify:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FORM_WEBHOOK_SECRET`
- `GOOGLE_SHEETS_WEBHOOK_URL` (optional for report push)

## Admin user creation

The dashboard uses `/.netlify/functions/admin-create-user` so only admins can create new users. The function:

- verifies the signed-in admin token
- creates a Supabase Auth user
- inserts the matching `public.users` profile
- returns a temporary password

Admins can also regenerate a system-managed password from the dashboard using `/.netlify/functions/admin-reset-user-password`.

The `users` table also tracks:

- `created_by`
- `last_active_at`
- `last_login_at`

Presence is updated from the frontend with a secure Supabase RPC so the dashboard can show who was active most recently.

## Google Form syncing

1. Connect the Google Form to a Google Sheet.
2. Open Apps Script on that sheet.
3. Paste [google-form-sync.gs](/C:/Users/DELL/Downloads/My%20webistes/Streams-Of-Joy-Johannesburg/church-system/apps-script/google-form-sync.gs).
4. Set script property `FORM_WEBHOOK_SECRET`.
5. Replace `YOUR-NETLIFY-SITE` with your live Netlify domain.
6. Create an installable trigger for `onFormSubmit`.

## Netlify deployment

1. Push the project to GitHub.
2. Connect the repo to Netlify.
3. Set publish directory to the repo root.
4. Netlify will use [netlify.toml](/C:/Users/DELL/Downloads/My%20webistes/Streams-Of-Joy-Johannesburg/church-system/netlify.toml) for redirects and function path.
5. Deploy.

Public intake page:

- `/intake`
- `/main-app/intake.html`

## Reporting

- Reports page filters by date, status, and assignee.
- CSV export runs in the browser.
- Optional Google Sheets push uses `/.netlify/functions/form-intake` in `report_export` mode.

## How to open the site

Right now this computer does not have `node`, `python`, `py`, or `netlify` available in the terminal, so the project cannot be started locally from this machine yet.

Fastest way to open it:

1. Deploy the repo to Netlify.
2. Open `/main-app/login.html` for staff login.
3. Open `/main-app/intake.html` for the public visitor form.

If Node.js is installed later, the best local option is `netlify dev` so redirects and Netlify functions work during testing.
