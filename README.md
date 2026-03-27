# Streams of Joy Johannesburg Church Management System

Production-ready church operations frontend on Netlify, backed by Firebase Authentication, Firestore, and Firebase Functions.

## What is included

- Role-based login for `Admin`, `Pastor`, and `Follow-up team`
- Manual user provisioning through Firebase callable functions
- Real-time people directory, follow-up workspace, and pastor dashboard
- Person profile pages with full Firestore field rendering and notes
- Audit logging in `activity_logs`
- Manual and scheduled Google Sheets export flow
- Firestore security rules and indexes

## Folder structure

- `shared/` shared Firebase app configuration
- `main-app/` static Netlify frontend
- `functions/` privileged Firebase Functions for user creation, password resets, and report exports
- `apps-script/` Google Apps Script webhook example for Sheets export

## Deployment

1. Deploy the static app to Netlify with the repo root as the publish directory.
2. Deploy Firebase Functions from `functions/`.
3. Set the Firebase Functions secret:
   - `firebase functions:secrets:set REPORT_WEBHOOK_URL`
4. Publish the Apps Script web app and paste its public URL into that secret.
5. Deploy Firestore rules and indexes:
   - `firebase deploy --only firestore`

## Required Firebase collections

- `people` (already exists and remains unchanged as the intake source)
- `users`
- `activity_logs`
- `report_exports`
- `people/{id}/notes`

## Important operating note

The app disables public signup in the UI and routes all user creation/reset flows through Firebase Functions. If you also want to hard-block all password self-service endpoints beyond the app UI, add Firebase Authentication blocking controls in your Firebase/Auth platform configuration.
