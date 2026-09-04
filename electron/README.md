# Ringnex Desktop (Electron)

This wraps the **existing web frontend** (`../frontend`) as a Windows/macOS
desktop app. It does **not** run the backend or MySQL locally — the desktop
app talks to your already-hosted Node/Express backend over the network,
exactly like a browser tab does today. This matters: every desktop install
shares the same central backend/database, which is what a multi-tenant SaaS
needs (a bundled local backend would give every PC its own isolated data
instead).

## One-time setup

1. Point the desktop build at your real backend and Firebase project:

   ```
   cd ../frontend
   cp .env.electron.example .env.electron
   ```

   Edit `frontend/.env.electron`:
   - `VITE_API_BASE_URL` — your backend's public origin (e.g.
     `https://asterisk.ringnex.co`). This gets baked into the packaged
     frontend at build time, since the desktop app is loaded from a
     different origin (`app://myaiobyoc`, see below) than the backend.
   - The `VITE_FIREBASE_*` values — copy them from `frontend/.env` (same
     project, Team Chat needs them to work in the desktop app too).

2. Confirm the backend allows that origin. `backend/src/config.js` already
   whitelists `app://myaiobyoc` by default (`EXTRA_FRONTEND_ORIGINS`), which
   is the custom scheme `electron/main.js` loads the app from — so as long
   as you didn't rename anything, there's nothing to change here.

3. Install dependencies:

   ```
   cd electron
   npm install
   ```

## Run it locally

```
npm start
```

This builds the frontend in Electron mode, copies it into `electron/app/`,
and launches the Electron window. Run it again any time you change frontend
code — there's no hot-reload in this shell, it's a straight rebuild-and-copy
each time (`npm run start:quick` skips the rebuild and just relaunches the
last-copied `app/` folder, if you only touched `electron/main.js`).

## Build the Windows installer

```
npm run dist:win
```

Produces an NSIS installer (`.exe`) and a portable `.exe` in
`electron/release/`. This is the "windows app" the plan asked for — it's a
normal build you can run on this machine.

## macOS build — config included, not buildable from Windows

`package.json`'s `build.mac` block is already set up (`.dmg` + `.zip`,
universal x64/arm64) — that's the "iOS/macOS configuration" requested. But
electron-builder cannot produce a working, code-signed macOS build from
Windows; you need an actual Mac (or a macOS CI runner, e.g. GitHub Actions'
`macos-latest`) to run `npm run dist:mac` on. Unsigned/unnotarized Mac
builds also trigger a Gatekeeper warning on the user's machine, so a real
release additionally needs an Apple Developer ID for signing + notarization
— out of scope until you're actually ready to ship to Mac users.

## Auto-update (GitHub Releases)

Installed apps update themselves from this repo's **GitHub Releases**
(`build.publish` in `package.json` → provider `github`,
`yasir-rasheed-dev/web_rtc_dialer`). The app checks ~12s after launch and
every 6h, and the header has a **"Check for updates"** button
(`frontend/src/components/layout/DesktopUpdater.jsx` ⇄
`electron/updater.js`).

### Cutting a release

1. Bump `version` in `electron/package.json` (and, if you like, keep it in
   step with the marketing site's version).
2. Build **and publish** the assets + update metadata to a GitHub Release:

   ```
   # from electron/ — needs a GH_TOKEN env var with repo access
   npm run release:win      # Windows: NSIS .exe + latest.yml
   npm run release:mac      # macOS (run on a Mac): .dmg + .zip + latest-mac.yml
   ```

   `--publish always` uploads to a **draft** release for the current
   version (electron-builder creates/reuses it). Or build with
   `npm run dist:win` / `dist:mac` and upload the contents of
   `electron/release/` to a GitHub Release by hand — the important files
   are the installers **and** `latest.yml` / `latest-mac.yml` (+ the
   `*.blockmap` files for delta updates).
3. **Publish** the GitHub Release (un-draft it). Mark it *pre-release* to
   keep it off the auto-update channel while testing.

The public **Releases page** (`website/releases.html`, linked from the
site nav) reads the same GitHub Releases API and lists every version with
its notes, downloads, and a **"Known issues & limitations"** callout.

### Writing the known-issues note

In the GitHub Release description, add a section the page will pull out and
highlight — any of these headings works (case-insensitive):

```
## Known issues
- Warm transfer to an external number is disabled in this build.
- macOS: the call popup can lose "always on top" after a Space switch.
```

A GitHub alert block is also lifted out:

```
> [!WARNING]
> Do not install on an agent mid-shift — it restarts the app.
```

Everything else in the description renders as the normal release notes.

### What updates vs. what just reloads

- **Native / shell changes** (anything in `electron/`, new permissions, a
  dependency bump) → needs a real release; the button downloads + installs
  it (Windows: in-app; macOS: see below).
- **Frontend-only changes** that are already live on the hosted backend →
  the same button, when there's no newer packaged build, just reloads the
  app's web content (`app:reload`) so it picks up fresh data. No reinstall.

### macOS caveat

Squirrel.Mac only *installs* a **code-signed + notarised** build. Until the
app has an Apple Developer ID, macOS users still get the update
notification, but the button opens the Releases page for a manual `.dmg`
instead of swapping the app in place. Windows (NSIS) auto-installs
unsigned (with a one-time SmartScreen prompt).

> If the repo's Releases are **private**, unauthenticated clients (the
> website page, and the updater without a bundled token) can't read them.
> Either publish Releases publicly, or switch `build.publish` to
> `{ "provider": "generic", "url": "https://ringnex.co/downloads/desktop/" }`
> and host `latest*.yml` + installers there.

## Call popup window

Incoming/active calls pop into their own small always-on-top window instead
of the in-page overlay the web app uses — Answer/Decline/Hangup/Mute/Hold,
plus a DTMF keypad and blind transfer. It never runs its own SIP connection
(there's still only ever one, in the main window) — it's a thin UI that
mirrors state and sends commands over Electron IPC. You can close it mid-call
without ending the call; the main window's header shows a green "call in
progress" pill the whole time a call is active, and clicking it reopens the
popup with the current live state. Warm/attended transfer stays on the main
window's Dialer page only — see `frontend/src/pages/call-window/CallWindow.jsx`
and `frontend/src/components/DesktopCallBridge.jsx` if you need to touch this.

## Things worth knowing

- **Microphone permission**: `main.js` allows the `media` and
  `notifications` permission requests unconditionally (Electron denies both
  by default) — required for the Softphone's SIP/WebRTC audio and Team
  Chat's desktop notifications to work at all.
- **Custom "app://myaiobyoc" origin**: the packaged frontend is served from
  a registered custom protocol, not `file://`. This keeps it on a stable
  origin the backend's CORS config already recognizes and avoids `file://`
  quirks (blocked `fetch`, `null` Origin headers). If you ever rename the
  scheme in `main.js` (`APP_SCHEME`/`APP_HOST`), update
  `EXTRA_FRONTEND_ORIGINS` on the backend to match, or every request will
  be rejected by CORS.
- **App icon**: no icon is configured yet, so builds use Electron's default
  icon. To add your own: drop a 256×256 `icon.ico` at `build/icon.ico`
  (Windows) and a `icon.icns` at `build/icon.icns` (macOS), then add
  `"icon": "build/icon.ico"` / `"icon": "build/icon.icns"` under the
  matching `win`/`mac` block in `package.json`.
- **Single instance lock**: launching the app a second time just focuses
  the existing window instead of opening another — two copies fighting over
  the same microphone/ringtone device would be a bad time for a softphone.
- **`electron/app/` and `electron/release/`** are build output
  (gitignored) — never hand-edit them, they get wiped and regenerated by
  `npm start` / `npm run dist*`.
