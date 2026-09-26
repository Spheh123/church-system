# Streams of Joy Johannesburg — Team Workspace

Church visitor care, follow-up management, leadership reporting and staff accountability.

Frontend: modular HTML/CSS/JavaScript, bundled with esbuild. Backend: the existing Supabase project (Auth, PostgreSQL, Realtime). Server endpoints and hosting: Netlify.

## Start here

See [DEPLOYMENT.md](DEPLOYMENT.md) for the exact database upgrade order, environment variables, Google Form preservation, password policy, reporting setup and required live checks. Local code and tests are not a substitute for live verification.

## Features

- Church website branding and responsive staff login/workspace
- Admin-created accounts, secure generated passwords, admin-only resets and access disabling
- Admin/pastor login history with server IP, available approximate location, device, timestamps and estimated active time
- Assigned-only follow-up team access, enforced in the database
- Complete profiles, leader profile corrections, prayer requests, notes and status tracking
- Next-follow-up dates and overdue list
- Real-time leadership and care views, with periodic refresh fallback
- Database audit triggers for record edits, assignments and notes
- Formatted Excel (.xlsx) visitor reports with column filters and all captured visitor fields
- Existing statuses and visitor records preserved by additive upgrade scripts

## Development

Use Node 24 and the pinned pnpm version in package.json.

```sh
pnpm install
pnpm test
pnpm build
pnpm dev
```

The static preview opens at http://127.0.0.1:4173 and does not emulate serverless functions. Netlify publishes only `dist`; do not deploy the repository root.

## Layout

- `main-app/`: staff pages, public intake, styles and client modules
- `shared/`: public config and Supabase client
- `netlify/functions/`: protected account, session, intake and report endpoints
- `supabase/`: base schema and incremental security/workflow upgrades
- `apps-script/`: optional visitor mirror and separate report receiver
- `scripts/`: build, local preview and non-sensitive backend diagnostics
- `tests/`: local PostgreSQL permission tests, UI regressions and endpoint tests

## Website access

The church website footer should link **Team Login** to:
https://care.streamsofjoyjohannesburg.org/main-app/login.html

Adding that footer link and deploying the upgrade are separate live steps described in the deployment guide. Never store service-role keys, generated passwords, visitor exports or other secrets in Git.
