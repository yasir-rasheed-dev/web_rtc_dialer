// Ringnex desktop shell.
//
// This does NOT run the Node/Express backend or MySQL — it just wraps the
// same React frontend used on the web, packaged as a desktop app, talking
// to your hosted backend over the network exactly like a browser tab would.
// See ../frontend/.env.electron for the backend URL that gets baked into
// the packaged frontend, and README.md in this folder for the full setup.
"use strict";

const { app, BrowserWindow, Menu, protocol, net, session, shell, ipcMain, screen } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { initUpdates } = require("./updater");

// Must match one of the backend's allowed CORS origins — see
// backend/src/config.js's EXTRA_FRONTEND_ORIGINS, which already whitelists
// "app://myaiobyoc" by default, so this works with zero backend changes.
// If you rename this, update EXTRA_FRONTEND_ORIGINS on the backend to match.
const APP_SCHEME = "app";
const APP_HOST = "myaiobyoc";

// The built frontend (frontend/dist, built with `npm run build:electron`)
// gets copied here by scripts/copy-frontend.js before packaging. In
// development (no packaged app/ folder yet) this falls back to
// frontend/dist directly so `npm start` works right after a plain
// `npm run build:electron` without a full electron-builder pass.
const FRONTEND_DIST = app.isPackaged
  ? path.join(process.resourcesPath, "frontend-dist")
  : (() => {
      const bundled = path.join(__dirname, "app");
      const fs = require("node:fs");
      return fs.existsSync(path.join(bundled, "index.html"))
        ? bundled
        : path.join(__dirname, "..", "frontend", "dist");
    })();

// Loading the packaged frontend from a real custom scheme (instead of
// file://) keeps it on a stable, CORS-friendly origin the backend already
// recognizes, and avoids file:// quirks (blocked fetch in some contexts,
// "null" Origin headers, no support for absolute "/x" paths, etc).
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      allowServiceWorkers: true
    }
  }
]);

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return new Response("Not found", { status: 404 });

    let relativePath = decodeURIComponent(url.pathname);
    if (!relativePath || relativePath === "/") relativePath = "/index.html";

    const target = path.normalize(path.join(FRONTEND_DIST, relativePath));
    // Path-traversal guard: never serve anything outside the bundled dist folder.
    if (!target.startsWith(path.normalize(FRONTEND_DIST))) {
      return net.fetch(pathToFileURL(path.join(FRONTEND_DIST, "index.html")).toString());
    }

    try {
      return await net.fetch(pathToFileURL(target).toString());
    } catch {
      // No client-side routing in this app (single-page, state-driven nav),
      // so an unknown path just means a bad request — fall back to index.
      return net.fetch(pathToFileURL(path.join(FRONTEND_DIST, "index.html")).toString());
    }
  });
}

function allowMicAndNotifications() {
  // Electron denies media/notification permission requests by default.
  // The Softphone needs microphone access for SIP/WebRTC calls, and Team
  // Chat asks for desktop notification permission — both are core features
  // of this app, not incidental, so they're allowed unconditionally here
  // rather than prompting (there's no untrusted third-party content loaded
  // in this window, only Ringnex's own frontend).
  const allowed = new Set(["media", "notifications"]);
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowed.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => allowed.has(permission));
}

let mainWindow = null;
let callWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#07111f",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });

  win.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html`);

  // Anything the app tries to open in a new window/tab (e.g. an
  // absolute-URL link) opens in the OS default browser instead of a
  // second Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  return win;
}

// The call popup — a small always-on-top "phone view" for incoming/active
// calls, separate from the main window (see DesktopCallBridge.jsx on the
// frontend side for what drives show/hide). It renders the SAME packaged
// bundle as the main window, just at a different in-app route (the
// "#call-window" hash), and never runs its own SIP client — it only
// mirrors state from, and sends commands to, the one SIP connection that
// lives in the main window. Created once and kept alive-but-hidden for the
// app's lifetime (like the main window keeps Softphone permanently mounted)
// so reopening it is instant and never loses state.
function createCallWindow() {
  const display = screen.getPrimaryDisplay();
  const { workArea } = display;
  const width = 340;
  const height = 540;

  const win = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 16,
    y: workArea.y + workArea.height - height - 16,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    backgroundColor: "#07111f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html#call-window`);
  win.setAlwaysOnTop(true, "floating");

  // A close click (the popup's own custom close button, or Alt+F4/OS
  // close) just hides it — it never ends the call, and the main window's
  // header shows a "call in progress" pill to reopen it. Only an actual
  // app quit tears this window down for real.
  win.on("close", (event) => {
    if (app.isQuitting) return;
    event.preventDefault();
    win.hide();
  });

  callWindow = win;
  win.on("closed", () => {
    if (callWindow === win) callWindow = null;
  });

  return win;
}

function showCallWindow() {
  if (!callWindow || callWindow.isDestroyed()) createCallWindow();
  callWindow.show();
  callWindow.focus();
}

function hideCallWindow() {
  if (callWindow && !callWindow.isDestroyed()) callWindow.hide();
}

function registerCallWindowIpc() {
  ipcMain.on("call-window:show", () => showCallWindow());
  ipcMain.on("call-window:hide", () => hideCallWindow());
  // Main window -> popup: live call state mirror.
  ipcMain.on("call-window:state", (_event, state) => {
    if (callWindow && !callWindow.isDestroyed()) callWindow.webContents.send("call-window:state", state);
  });
  // Popup -> main window: answer/decline/hangup/mute/hold/transfer/dtmf —
  // the main window's DesktopCallBridge dispatches these to the real
  // window.ringnex* functions Softphone.jsx already exposes.
  ipcMain.on("call-window:command", (_event, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("call-window:command", payload);
  });
  // Main window -> popup: outcome of a command (currently just transfer).
  ipcMain.on("call-window:command-result", (_event, result) => {
    if (callWindow && !callWindow.isDestroyed()) callWindow.webContents.send("call-window:command-result", result);
  });
}

// Two copies of a softphone fighting over the same microphone/ringtone
// device is a bad time — keep it to one running instance.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    registerAppProtocol();
    allowMicAndNotifications();
    registerCallWindowIpc();
    initUpdates(() => mainWindow);
    Menu.setApplicationMenu(null);
    const win = createWindow();

    // The call window stays alive-but-hidden across the main window's
    // lifetime (see createCallWindow) — that means it's still a "window"
    // as far as Electron's own window-all-closed accounting goes, so that
    // event alone won't fire just because the main window closes. Closing
    // the main window is what should actually end the app (outside
    // macOS's dock convention), so this listens directly for it instead.
    win.on("closed", () => {
      if (process.platform !== "darwin") app.quit();
    });

    app.on("activate", () => {
      if (!mainWindow) createWindow();
    });
  });

  // Lets the call window's own "close hides instead of quits" handler
  // (see createCallWindow) know a real shutdown is happening, so it
  // doesn't block the app from exiting.
  app.on("before-quit", () => {
    app.isQuitting = true;
  });
}
