# Ringnex — WebRTC Contact Center

A multi-tenant, browser-based contact center built on **Asterisk + PJSIP** with a
**React WebRTC softphone**, a **Node/Express + Socket.IO** backend, and an optional
**Electron desktop app**. Each workspace (tenant) gets fully isolated users,
numbers, calls, recordings, campaigns and reports against one shared backend.

---

## Contents

- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Feature reference](#feature-reference)
- [Repository layout](#repository-layout)
- [Setup](#setup)
- [Desktop app](#desktop-app)

---

## Architecture

```
                +---------------------------+
  Browser  ---> |  React SPA (Vite + sip.js) |  WebRTC (WSS) ─┐
  / Electron    +---------------------------+                 │
        │  REST + Socket.IO                                    ▼
        ▼                                          +----------------------+
  +-----------------------------+   AMI / AstDB    |  Asterisk (PJSIP     |
  |  Node/Express + Socket.IO   | <-------------->  |  Realtime) +        |
  |  backend/                   |                   |  Commio SIP trunk   |
  |  - auth / RBAC              |                   +----------------------+
  |  - call tracker (CDR)       |                             │
  |  - campaign / dialer engine |                    SSHFS mounts for
  |  - REST APIs                |                    recordings + voicemail
  +-----------------------------+
        │
        ▼
   MySQL / MariaDB   +   Firebase Realtime DB (Team Chat + FCM)
```

- The frontend talks to the backend over REST + Socket.IO and to Asterisk directly
  over WebRTC (`wss://…/webrtc-ws`) for call audio.
- The backend never bridges audio — it tracks call state from **AMI** events,
  writes CDRs, reconciles tenant→endpoint mappings into **AstDB**, and serves
  recording / voicemail files from the Asterisk spool (local or SSHFS-mounted).
- Call recordings and voicemails are produced by the Asterisk dialplan
  (`MixMonitor` / `Record`) and streamed back through the API with range support.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, **sip.js** (WebRTC), Firebase JS SDK, framer-motion, lucide-react, react-select, sonner |
| Backend | Node ≥ 20, Express 4, Socket.IO 4, **mysql2**, JWT, bcryptjs, **otplib** (TOTP 2FA), firebase-admin (chat / FCM), multer (uploads), pdfkit (PDF reports), xlsx (contact import), helmet, express-rate-limit |
| Telephony | Asterisk (custom `/opt/ringnex-webrtc` build) + PJSIP Realtime, **Commio** SIP trunk / DID provisioning / CDR, AMI |
| Desktop | Electron 33 + electron-builder (NSIS + portable `.exe`, macOS dmg/zip config) |
| Data | MySQL / MariaDB (primary), Firebase Realtime Database (Team Chat + push) |

---

## Feature reference

### Calling & softphone
- **WebRTC softphone** in the browser (sip.js) — one SIP registration per session.
- Outbound + inbound calls, mute, **hold / resume**, **DTMF** keypad.
- **Blind transfer** and **warm / attended transfer** (same-tenant targets only).
- **Add participant** — multi-party conference bridge.
- **Call recording** (`MixMonitor`) on outbound, inbound-to-agent and toll-free
  queue legs, permission-gated per agent.
- **Global call overlay** in-page, plus a dedicated **always-on-top call window**
  in the desktop app (Answer / Decline / Hangup / Mute / Hold / DTMF / transfer),
  detachable mid-call.
- Ringtone, caller-ID resolution against saved contacts, per-agent outbound DID.

### Voicemail
- **Redirect declined / unanswered calls to voicemail** (opt-in per role).
- Voicemail capture via the dialplan; files served through the API.
- **Voicemail playback** with a themed audio player, unread **badge counts**,
  real duration computed from the WAV.

### Call logs, recordings & dispositions
- **Call Logs** — full history with date / agent / search filters and pagination.
- Inline **recording playback** button on each row; dedicated **Recordings** page.
- **Editable call disposition** from the logs.
- **Shared dispositions** — one per-tenant list (name + colour) used everywhere
  (softphone, auto-dialer, end-call popup); managed from a dispositions admin UI.
- **End Call popup** — auto-opens when a *connected* call ends (role-gated).
  Prefilled number / duration; editable client details; **save-to-contact**
  toggle; disposition picker; **next follow-up date + time**; required remarks;
  **file attachments**; **tags**.

### Leads & follow-ups
- **Leads** — persistent customer / prospect records that accumulate
  **interaction history** across multiple calls (not per-call throwaways).
- Lead name / phone / address, latest-disposition mirror, tags, attachments.
- **Follow-ups dashboard** — totals for *all / today / missed*, with a
  navigation badge for due follow-ups.

### Contacts
- Contacts with **multiple phone numbers and addresses** each.
- Create / edit / delete (each permission-gated).
- **Lookup by number** — resolves an inbound / outbound number to a saved
  contact’s name, company and job title.

### Auto dialer
- **Campaigns** with ring strategy, per-campaign disposition set and reporting.
- **Contact upload** (XLSX / CSV) and **contact assignment** to agents.
- Contact **locking** so two agents never get the same record.
- Agent **auto-dial** flow with **skip contact**, disposition capture.
- **Campaign reports** with export.

### Toll-free / inbound campaigns
- **Toll-free numbers** and inbound **queue campaigns**.
- **Dynamic, data-driven IVR** — greetings and digit options stored in the DB
  (AstDB), no static dialplan edits per IVR.
- **Toll-free live dashboard** and toll-free reports.

### Supervisor & live monitoring
- **Live calls board** — active calls across the workspace / supervised teams.
- **Listen (monitor)**, **whisper**, and **barge** (ChanSpy), each a separate
  permission, scoped to the supervisor’s teams.

### Teams
- Teams with **members** and **supervisors**.
- **Team-scoped data access** — calls, recordings, voicemails, leads and reports
  can be limited to a supervisor’s own teams.

### Users / agents
- User CRUD with role assignment.
- **Automatic PJSIP Realtime provisioning** — globally-unique, tenant-aware SIP
  usernames; **tenant-local extension allocation** from a configurable start
  number; optional **per-agent DID**.
- **Live agent status** (Ready / On-Call / …) driven from call events.
- **Agent security** — TOTP **two-factor authentication** with QR enrolment.

### Roles & permissions
- **Dynamic roles** per workspace (`roles`, `permissions`, `role_permissions`).
- ~70-permission catalog across Call & Media, Agent Dashboard, Admin Dashboard,
  Supervisor, Auto Dialer, Toll-Free, Compliance, Billing, Security.
- **Permission-driven menus and call-control buttons** on the frontend, with
  **enforcement on every backend route**.
- Single active session per user (a new login instantly revokes the old token).

### Phone numbers / DIDs
- DID inventory, **assignment to agents**, routing profiles.
- **Purchase numbers via Commio** (feature-flagged per tenant), with pending-order
  tracking and carrier reconciliation.

### DNC / compliance
- **Do-Not-Call list** management (import + manual).
- Calls to DNC numbers blocked, with an explicit **override permission**.

### Dashboards & reports
- **Agent dashboard** — KPI row and activity charts.
- **Owner dashboard** — team-level rollups.
- **Reports hub** — call reports (**PDF export**), campaign reports, toll-free
  reports.
- **Usage** — per-tenant seat counts and inbound / outbound minute usage;
  `carrier_cdrs` model for Commio CDR / cost reconciliation.

### Team chat
- Real-time chat on **Firebase Realtime Database** — channels and direct
  messages, emoji picker, **file attachments**, **desktop push notifications**
  (FCM) that also work inside the desktop app.

### Multi-tenancy & security
- **Workspace + email + password** login; every record is tenant-scoped.
- **Tenant-aware Socket.IO rooms**; tenant→endpoint / status / extension maps
  reconciled into **AstDB** whenever AMI connects; tenant-aware Asterisk routing.
- JWT auth, bcrypt password hashing, TOTP 2FA, **AES-256-GCM** encryption for
  stored SIP secrets and TOTP secrets, Helmet headers, rate limiting, strict
  CORS origin allowlist (browser origin **and** the desktop `app://` origin).

---

## Repository layout

```
backend/
  src/
    server.js            REST API + Socket.IO wiring
    ami.js               Asterisk Manager Interface client
    callTracker.js       call-state machine -> CDR rows, recording/vm signals
    campaign*.js          auto-dialer engine + routes
    tollFreeRoutes.js    toll-free numbers / campaigns / IVR
    leadsRoutes.js       leads + follow-ups
    voicemailRoutes.js   voicemail listing + streaming
    dncRoutes.js         do-not-call list
    commio*.js            Commio DID purchase / CDR
    sipProvisioning.js   PJSIP Realtime endpoint creation
    security.js totp.js  auth, JWT, 2FA, field encryption
    permissions.js       permission catalog + role defaults
  migrations/            ordered SQL migrations
  asterisk/             dialplan reference snippets (merge into the custom Asterisk)
frontend/
  src/pages/            one folder per module (softphone, calls, leads, …)
  src/components/ui/    shared UI (AudioPlayer, EndCallPopup, TagInput, …)
  src/lib/              API clients, permissions, phone helpers
electron/
  main.js              custom app:// protocol, windows, permissions
  package.json         electron-builder config (Windows / macOS targets)
```

---

## Setup

### Prerequisites
- Node ≥ 20, MySQL / MariaDB
- A reachable Asterisk (custom `/opt/ringnex-webrtc` build) with AMI enabled
- A Firebase project (Realtime Database + Cloud Messaging) for Team Chat

### Backend
```bash
cd backend
cp .env.example .env         # fill DB, JWT_SECRET, SIP_CREDENTIAL_KEY, AMI_*, Firebase, Commio
npm install
npm run migrate:saas         # create / update schema
npm start                    # http://127.0.0.1:3100 by default
```

Key env values: `DB_*`, `JWT_SECRET`, `SIP_CREDENTIAL_KEY` (base64, 32 bytes),
`AMI_HOST` / `AMI_PORT` / `AMI_USERNAME` / `AMI_SECRET`,
`RECORDING_ROOT` / `VOICEMAIL_ROOT`, `FRONTEND_ORIGIN`,
`EXTRA_FRONTEND_ORIGINS` (keep `app://myaiobyoc` for the desktop app),
`FIREBASE_*`, `COMMIO_*`.

### Frontend
```bash
cd frontend
cp .env.example .env         # VITE_API_BASE_URL, VITE_WSS_URL, VITE_SIP_DOMAIN, VITE_FIREBASE_*
npm install
npm run dev                  # http://localhost:5173
npm run build                # production build -> dist/
```

### Asterisk
Merge the snippets in `backend/asterisk/` into the **custom** Asterisk
(`/opt/ringnex-webrtc/etc/asterisk/…`) only. The backend writes these AstDB
families automatically: `ringnex_tenant/<endpoint>`,
`ringnex_tenant_status/<tenant>`, `ringnex_ext/<tenant>/<ext>`,
`ringnex_did/<endpoint>`, `ringnex_perm/<endpoint>/<PERMISSION>`.

---

## Desktop app

Wraps the built frontend as a Windows / macOS app that talks to the hosted
backend over the network (no local backend or DB).

```bash
cd frontend && cp .env.electron.example .env.electron   # set VITE_API_BASE_URL to the public backend
cd ../electron && npm install
npm start            # run locally
npm run dist:win     # NSIS installer + portable .exe -> electron/release/
```

The packaged app loads from a custom `app://myaiobyoc` origin (must be in the
backend’s `EXTRA_FRONTEND_ORIGINS`). Incoming / active calls open in a separate
always-on-top window. See `electron/README.md` for details (icons, code-signing,
macOS notes).
