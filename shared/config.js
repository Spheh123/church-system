export const supabaseConfig = {
  url: "https://YOUR-PROJECT.supabase.co",
  anonKey: "YOUR_SUPABASE_ANON_KEY",
};

export const appConfig = {
  appName: "Streams of Joy Johannesburg Follow-Up",
  supportEmail: "admin@streamsofjoyjhb.org",
  formWebhookPath: "/.netlify/functions/form-intake",
  adminUserProvisionPath: "/.netlify/functions/admin-create-user",
  firstTimerWindowDays: 7,
  sessionHeartbeatMs: 60_000,
  activityThrottleMs: 180_000,
};

export const roles = ["admin", "pastor", "team"];

export const followUpStatuses = [
  "not_called",
  "called_no_answer",
  "voicemail",
  "feedback_given",
  "not_interested",
  "follow_up_again",
];

export const statusLabels = {
  not_called: "Not Called",
  called_no_answer: "Called No Answer",
  voicemail: "Voicemail",
  feedback_given: "Feedback Given",
  not_interested: "Not Interested",
  follow_up_again: "Follow Up Again",
};

export const statusToneMap = {
  not_called: "warning",
  called_no_answer: "danger",
  voicemail: "info",
  feedback_given: "success",
  not_interested: "muted",
  follow_up_again: "accent",
};

export const followUpBoardColumns = [
  "not_called",
  "called_no_answer",
  "voicemail",
  "feedback_given",
  "follow_up_again",
];

export const navItems = [
  { key: "dashboard", label: "Dashboard", href: "dashboard.html", roles },
  { key: "people", label: "People", href: "people.html", roles },
  { key: "followup", label: "Follow-Up Board", href: "followup.html", roles },
  { key: "reports", label: "Reports", href: "reports.html", roles: ["admin", "pastor"] },
];

export const defaultRouteByRole = {
  admin: "dashboard.html",
  pastor: "dashboard.html",
  team: "followup.html",
};

export const personFieldOrder = [
  "full_name",
  "email",
  "phone",
  "area_of_residence",
  "dob",
  "gender",
  "occupation",
  "marital_status",
  "service_feedback",
  "nsppdian",
  "next_sunday",
  "membership_interest",
  "whatsapp_group",
  "prayer_points",
  "invite",
  "invite_details",
  "created_at",
];

export const personFieldLabels = {
  full_name: "Full Name",
  email: "Email",
  phone: "Cellphone Number",
  area_of_residence: "Area of Residence",
  dob: "Date of Birth",
  gender: "Gender",
  occupation: "Occupation",
  marital_status: "Marital Status",
  service_feedback: "Service Feedback",
  nsppdian: "NSPPDian",
  next_sunday: "Next Sunday",
  membership_interest: "Membership Interest",
  whatsapp_group: "WhatsApp Group",
  prayer_points: "Prayer Points",
  invite: "Invite",
  invite_details: "Invite Details",
  created_at: "Captured At",
};
