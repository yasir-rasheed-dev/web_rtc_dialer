export const PERMISSIONS = Object.freeze([
  { key: "VIEW_DASHBOARD", name: "View Dashboard", category: "General" },
  { key: "VIEW_DIALER", name: "View Dialer", category: "Call & Media" },
  { key: "MAKE_CALLS", name: "Make Outbound Calls", category: "Call & Media" },
  { key: "RECEIVE_CALLS", name: "Receive Inbound Calls", category: "Call & Media" },
  { key: "HOLD_CALL", name: "Hold / Resume Calls", category: "Call & Media" },
  { key: "SEND_DTMF", name: "Send DTMF", category: "Call & Media" },
  { key: "BLIND_TRANSFER", name: "Blind Transfer", category: "Call & Media" },
  { key: "WARM_TRANSFER", name: "Warm Transfer", category: "Call & Media" },
  { key: "ADD_PARTICIPANT", name: "Add Participant", category: "Call & Media" },
  { key: "RECORD_CALL", name: "Recording", category: "Call & Media" },
  { key: "VIEW_CALL_LOGS", name: "View Call Logs", category: "Agent Dashboard" },
  { key: "EDIT_CALL_DISPOSITION", name: "Edit Call Disposition", category: "Agent Dashboard" },
  { key: "VIEW_RECORDINGS", name: "Play Recordings", category: "Agent Dashboard" },
  { key: "VIEW_CONTACTS", name: "View Contacts", category: "Agent Dashboard" },
  { key: "CREATE_CONTACTS", name: "Create Contacts", category: "Agent Dashboard" },
  { key: "EDIT_CONTACTS", name: "Edit Contacts", category: "Agent Dashboard" },
  { key: "DELETE_CONTACTS", name: "Delete Contacts", category: "Agent Dashboard" },
  { key: "VIEW_AGENTS", name: "View Users / Agents", category: "Admin Dashboard" },
  { key: "MANAGE_AGENTS", name: "Manage Users / Agents", category: "Admin Dashboard" },
  { key: "VIEW_TEAMS", name: "View Teams", category: "Admin Dashboard" },
  { key: "MANAGE_TEAMS", name: "Manage Teams", category: "Admin Dashboard" },
  { key: "VIEW_ROLES", name: "View Roles", category: "Admin Dashboard" },
  { key: "MANAGE_ROLES", name: "Manage Roles", category: "Admin Dashboard" },
  { key: "VIEW_REPORTS", name: "View Reports", category: "Admin Dashboard" },
  { key: "VIEW_USAGE", name: "View Usage", category: "Admin Dashboard" },
  { key: "VIEW_DIDS", name: "View Phone Numbers / DIDs", category: "Admin Dashboard" },
  { key: "MANAGE_DIDS", name: "Assign Phone Numbers / DIDs", category: "Admin Dashboard" },
  // Deliberately separate from MANAGE_DIDS (which only assigns numbers
  // already owned): this gates spending real money against the tenant's
  // Commio account, so it must never be bundled into a broader permission
  // OR-list or granted to any role by default other than Owner/Admin.
  { key: "PURCHASE_DIDS", name: "Purchase Phone Numbers (Commio)", category: "Admin Dashboard" },
  { key: "MONITOR_CALLS", name: "Live Call Monitoring", category: "Supervisor" },
  { key: "LISTEN_LIVE_CALLS", name: "Listen Live Calls", category: "Supervisor" },
  { key: "WHISPER_CALLS", name: "Whisper", category: "Supervisor" },
  { key: "BARGE_CALLS", name: "Barge", category: "Supervisor" },
  { key: "VIEW_BILLING", name: "View Billing", category: "Billing" },
  { key: "MANAGE_SETTINGS", name: "Manage Tenant Settings", category: "Security & Account" },
  { key: "VIEW_CAMPAIGNS", name: "View Campaigns", category: "Auto Dialer" },
  { key: "CREATE_CAMPAIGNS", name: "Create Campaigns", category: "Auto Dialer" },
  { key: "MANAGE_CAMPAIGNS", name: "Manage Campaigns", category: "Auto Dialer" },
  { key: "UPLOAD_CONTACTS", name: "Upload Contacts", category: "Auto Dialer" },
  { key: "ASSIGN_CONTACTS", name: "Assign Contacts", category: "Auto Dialer" },
  { key: "USE_AUTO_DIALER", name: "Use Auto Dialer", category: "Auto Dialer" },
  { key: "SKIP_CONTACT", name: "Skip Contact", category: "Auto Dialer" },
  { key: "VIEW_CAMPAIGN_REPORTS", name: "View Campaign Reports", category: "Auto Dialer" },
  { key: "EXPORT_CAMPAIGN_REPORTS", name: "Export Campaign Reports", category: "Auto Dialer" }
]);

const OWNER_BLOCKED = new Set([
  "VIEW_DIALER",
  "MAKE_CALLS",
  "RECEIVE_CALLS",
  "HOLD_CALL",
  "SEND_DTMF",
  "BLIND_TRANSFER",
  "WARM_TRANSFER",
  "ADD_PARTICIPANT",
  "RECORD_CALL",
  "MONITOR_CALLS",
  "LISTEN_LIVE_CALLS",
  "WHISPER_CALLS",
  "BARGE_CALLS",
  "USE_AUTO_DIALER",
  "SKIP_CONTACT"
]);

export const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
  "Tenant Owner": PERMISSIONS.map((item) => item.key).filter((key) => !OWNER_BLOCKED.has(key)),
  "Tenant Admin": PERMISSIONS.map((item) => item.key),
  Supervisor: [
    "VIEW_DASHBOARD", "VIEW_DIALER", "MAKE_CALLS", "RECEIVE_CALLS", "HOLD_CALL", "SEND_DTMF",
    "BLIND_TRANSFER", "WARM_TRANSFER", "ADD_PARTICIPANT", "RECORD_CALL", "VIEW_CALL_LOGS",
    "EDIT_CALL_DISPOSITION", "VIEW_RECORDINGS", "VIEW_CONTACTS", "CREATE_CONTACTS", "EDIT_CONTACTS",
    "VIEW_AGENTS", "VIEW_TEAMS", "VIEW_REPORTS", "MONITOR_CALLS", "LISTEN_LIVE_CALLS",
    "WHISPER_CALLS", "BARGE_CALLS",
    "VIEW_CAMPAIGNS", "ASSIGN_CONTACTS", "USE_AUTO_DIALER", "SKIP_CONTACT",
    "VIEW_CAMPAIGN_REPORTS", "EXPORT_CAMPAIGN_REPORTS"
  ],
  Agent: [
    "VIEW_DASHBOARD", "VIEW_DIALER", "MAKE_CALLS", "RECEIVE_CALLS", "HOLD_CALL", "SEND_DTMF",
    "BLIND_TRANSFER", "WARM_TRANSFER", "ADD_PARTICIPANT", "RECORD_CALL", "VIEW_CALL_LOGS",
    "EDIT_CALL_DISPOSITION", "VIEW_RECORDINGS", "VIEW_CONTACTS", "CREATE_CONTACTS", "EDIT_CONTACTS",
    "VIEW_CAMPAIGNS", "USE_AUTO_DIALER", "SKIP_CONTACT"
  ]
});
