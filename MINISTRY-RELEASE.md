# Ministry operations release

Apply `supabase/usher-role.sql` separately, then `supabase/ministry-live-upgrade.sql` before deploying this frontend. Both require the existing schema/upgrade. The migration preserves existing visitors, users, notes and assignments. No historical first visits are invented.

- Usher accounts have a separate `/main-app/usher-login.html` entry and only attendance/training navigation. Database row-level security denies visitor access.
- Attendance stores adult men, adult women, teens and children once per person per service. Special events require names. Updates use version checks and retain the before/after counts in leader-only activity history.
- New visitor intake records its supplied service date as a first visit. Existing Google Form ingestion is unchanged; imported historical visitors need verified visit dates added on their profiles.
- Fair assignment is opt-in per active team member. New arrivals are assigned automatically once workers are available; the leader can distribute the existing unassigned queue. Completed/not-interested assignments do not contribute to workload. Existing assignments are not redistributed.
- Restricted pastoral notes have their own protected table, visible to admins/pastors, never in normal timeline text or Excel exports.
- Exports are server-authorised. Contact-only Excel is the default. Administrators can export free-text care details and may grant this capability to pastors. These controls govern the export feature, not the ability of an authorised reader to manually copy information.
- The care queue is an in-app workflow, not an email/SMS or emergency alert service.
- Recorded attendance totals count visits to services, not unique people. Missing service entries are not zero; monthly totals depend on service count. Age boundaries must follow the church's existing counting practice.
- Existing follow-up status saves create a successful-contact milestone when changed to Contacted; failed attempts can be recorded separately. First-contact averages exclude visitors with no recorded successful contact and display the sample size.

Role-specific instructions are published privately by `node scripts/build-manuals.cjs`.
