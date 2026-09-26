export const supabaseConfig = {
  url: "https://pyqwigkelwavbgbiwfhh.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cXdpZ2tlbHdhdmJnYml3ZmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTUwMjQsImV4cCI6MjA5MDQ3MTAyNH0.LifLPfFqb0Nhmzm_EPVI5xGfMUOPHCFlyrzEjSKP0yg",
};

export const appConfig = {
  appName: "Streams of Joy Johannesburg Follow-Up",
  supportEmail: "admin@streamsofjoyjhb.org",
  logoPath: "assets/church-logo.png",
  formWebhookPath: "/.netlify/functions/form-intake",
  adminUserProvisionPath: "/.netlify/functions/admin-create-user",
  adminPasswordResetPath: "/.netlify/functions/admin-reset-user-password",
  publicIntakePath: "intake.html",
  firstTimerWindowDays: 2,
  sessionHeartbeatMs: 60_000,
  activityThrottleMs: 180_000,
};

export const roles = ["super_admin", "admin", "coordinator", "pastor", "team", "usher"];

export const followUpStatuses = [
  "not_called",
  "contacted",
  "completed",
  "called_no_answer",
  "voicemail",
  "feedback_given",
  "not_interested",
  "follow_up_again",
];

export const statusLabels = {
  contacted: "Contacted",
  completed: "Completed",
  not_called: "Pending",
  called_no_answer: "Not reachable",
  voicemail: "Voicemail",
  feedback_given: "Contacted (legacy)",
  not_interested: "Not Interested",
  follow_up_again: "Follow Up Again",
};

export const statusToneMap = {
  contacted: "info",
  completed: "success",
  not_called: "warning",
  called_no_answer: "danger",
  voicemail: "info",
  feedback_given: "success",
  not_interested: "muted",
  follow_up_again: "accent",
};

export const followUpBoardColumns = followUpStatuses;

export const navItems = [
  { key: "attendance", label: "Attendance stats", usherLabel: "Submit attendance", href: "attendance.html", roles: ["super_admin","admin","pastor","usher"] },
  { key: "ministry", label: "Visitor care & journey", href: "ministry.html", roles: ["super_admin","admin","coordinator","pastor","team"] },
  { key: "dashboard", label: "Dashboard", href: "dashboard.html", roles: ["super_admin","admin","coordinator","pastor"] },
  { key: "people", label: "People", href: "people.html", roles: ["super_admin","admin","coordinator","pastor","team"] },
  { key: "followup", label: "Follow-Up Board", href: "followup.html", roles: ["super_admin","admin","coordinator","pastor","team"] },
  { key: "reports", label: "Reports", href: "reports.html", roles: ["super_admin","admin","coordinator","pastor"], requiresReportPermission: true },
  { key: "training", label: "Training manuals", href: "training.html", roles },
];

export const defaultRouteByRole = {
  super_admin: "dashboard.html",
  admin: "dashboard.html",
  coordinator: "dashboard.html",
  pastor: "dashboard.html",
  team: "followup.html",
  usher: "attendance.html",
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
