
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBZTrE4PuhIky5qaB1jmtoGuUyqVTWbg0Q",
  authDomain: "streams-of-joy-jhb.firebaseapp.com",
  projectId: "streams-of-joy-jhb",
  storageBucket: "streams-of-joy-jhb.firebasestorage.app",
  messagingSenderId: "13302946345",
  appId: "1:13302946345:web:90f191028bdc8cc1f51a38"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const appConfig = {
  appName: "Streams of Joy Johannesburg CMS",
  supportEmail: "admin@streamsofjoyjhb.org",
  sessionHeartbeatMs: 60_000,
  newVisitorHours: 48,
  dailyReportHour: 18,
};

export const roles = ["Admin", "Pastor", "Follow-up team"];

export const followUpStatuses = [
  "Pending",
  "Contacted",
  "Not reachable",
  "Follow-up again",
  "Completed",
];

export const statusToneMap = {
  Pending: "warning",
  Contacted: "info",
  "Not reachable": "danger",
  "Follow-up again": "accent",
  Completed: "success",
};

export const navItems = [
  { key: "dashboard", label: "Dashboard", href: "dashboard.html", roles: ["Admin", "Pastor"] },
  { key: "people", label: "People", href: "people.html", roles: roles },
  { key: "followup", label: "Follow-up", href: "followup.html", roles: roles },
  { key: "reports", label: "Reports", href: "reports.html", roles: ["Admin", "Pastor"] },
];

export const defaultRouteByRole = {
  Admin: "dashboard.html",
  Pastor: "dashboard.html",
  "Follow-up team": "followup.html",
};
