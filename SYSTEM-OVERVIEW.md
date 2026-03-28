# Church Management System Flow

## 1. Visitor data collection

1. A visitor fills in the Google Form.
2. The Google Form writes the response into Google Sheets.
3. Your existing Apps Script reads the new row.
4. Apps Script sends the row into Firebase Firestore.
5. The document is stored in the `people` collection.

This part is already your live intake pipeline and does not need to be broken or replaced.

## 2. What the web system does next

Once a person is inside Firestore:

- The `People` page shows the record in real time.
- The `Person Profile` page opens the full visitor history and all submitted fields.
- Prayer requests are highlighted for pastoral care.
- Follow-up users can add notes in `people/{personId}/notes`.
- Admins and Pastors can assign a person to a follow-up worker.
- Follow-up status moves through:
  - `Pending`
  - `Contacted`
  - `Not reachable`
  - `Follow-up again`
  - `Completed`

## 3. Authentication and user control

- Users are stored in `users`.
- Login is through Firebase Authentication with email and password.
- Public signup is not used.
- Admins and Pastors create users manually.
- Password resets happen through Firebase Functions, not through a public reset form.

## 4. Activity and audit trail

Everything important is written into `activity_logs`:

- login
- logout
- viewing records
- editing records
- assigning follow-ups
- report exports

That gives you accountability for who opened what, who changed what, and how long a session lasted.

## 5. Pastor dashboard

The dashboard is designed for leadership visibility:

- people needing prayer
- people not yet contacted
- new visitors from the last 48 hours
- follow-up progress summary
- user management for Admin and Pastor roles

## 6. Reporting to Google Sheets

- Manual export can be triggered from the `Reports` page.
- Daily export is handled by a scheduled Firebase Function.
- The function posts the selected report data to your Apps Script webhook.
- Apps Script writes the data into Google Sheets for ministry reporting.

## 7. What you can tell the team today

You can present the system like this:

"Google Form is still our front door. Nothing in the intake process changes. Once the form is submitted, the response goes to Google Sheets, then Apps Script pushes it into Firestore. From there, our church management system takes over in real time. Admins, pastors, and the follow-up team can immediately see the person, track prayer needs, assign follow-up, add notes, monitor activity, and export reports to Google Sheets."

## 8. Go-live checklist

- Confirm every user has both:
  - a Firebase Authentication account
  - a matching Firestore `users/{uid}` document
- Deploy the latest frontend files
- Deploy Firestore rules and indexes
- Deploy Firebase Functions
- Set the `REPORT_WEBHOOK_URL` secret for the Apps Script endpoint
- Publish on a proper HTTPS custom domain

## 9. Browser safety note

If Chrome flags the login page as suspicious, that is usually not caused by Firestore itself. It is usually one of these:

- the app is running on a temporary or unfamiliar domain
- the domain has not built enough trust yet
- the page looks like a generic login page without strong branding
- the site is being opened from an insecure or unusual preview URL

The correct production fix is:

1. Use a church-owned custom domain.
2. Keep HTTPS enabled.
3. Use clear church branding, favicon, and contact identity.
4. Avoid sharing raw preview links for production use.
