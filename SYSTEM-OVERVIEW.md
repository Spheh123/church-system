# Church Follow-Up System Overview

## Intake flow

1. A visitor fills in the Google Form.
2. Google Form writes the response into Google Sheets.
3. Apps Script listens for each new form submission.
4. Apps Script sends the response to the Netlify intake endpoint.
5. Netlify inserts the normalized record into Supabase `people`.
6. Supabase automatically creates a default `followups` row for that person.

## What the system does next

Once the person is inside Supabase:

- the dashboard updates with live counts
- the people page lists the record immediately
- the follow-up board shows the person under `Not Called`
- pastors and team members can add notes
- admins and pastors can assign ownership
- every change is written into `activity_logs`

## Main database objects

- `users`
- `people`
- `followups`
- `followup_notes`
- `activity_logs`
- `people_overview` view

## Role access

`admin`
- full access
- create users
- export reports

`pastor`
- view all people
- update follow-ups
- view reports

`team`
- only sees assigned people
- updates statuses
- adds notes

## Core screens

- `login.html`
- `dashboard.html`
- `people.html`
- `person.html`
- `followup.html`
- `reports.html`

## Team presentation summary

"Google Form remains the intake front door. We do not need to change how visitors submit their details. Each response goes from Google Form to Google Sheets, then through Apps Script into our Netlify intake endpoint, and finally into Supabase. From there the church follow-up system takes over in real time for tracking, assignment, notes, accountability, and reporting."

## Go-live checklist

1. Run the SQL in `supabase/schema.sql`
2. Set Supabase URL and anon key in `shared/config.js`
3. Add Netlify environment variables
4. Connect Apps Script to `/.netlify/functions/form-intake`
5. Create the first admin in Supabase Auth and `public.users`
6. Deploy to Netlify
