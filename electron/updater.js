// Auto-update wiring for the Ringnex desktop app.
//
// Feed = GitHub Releases of this repo (see "publish" in package.json).
// Publish a new GitHub Release (with the installer assets + the
// latest*.yml files electron-builder generates) and every installed app
// picks it up: a passive check on launch + every 6h, plus the manual
// "Check for updates" button in the app header.
//
// Windows (NSIS): full download + install + relaunch, in-app.
// macOS: Squirrel.Mac only auto-installs a SIGNED build. Until the app is
//   code-signed + notarised we can't silently swap it, so on macOS the
//   "download" step just opens the Releases page for a manual .dmg — the
//   user still gets the same notification and one-click path to it.
"use strict";

const { app, ipcMain, shell } = require("electron");

const RELEASES_URL = "https://github.com/yasir-rasheed-dev/web_rtc_dialer/releases";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
const FIRST_CHECK_DELAY_MS = 12 * 1000;

let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch {
  autoUpdater = null; // dependency missing (e.g. a stripped dev checkout)
}

function initUpdates(getMainWindow) {
  const send = (payload) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send("updates:event", payload);
  };

  const isDarwin = process.platform === "darwin";
  const canAutoUpdate = Boolean(autoUpdater) && app.isPackaged;

  // Always answer the renderer, even when we can't really update, so the
  // header button never just hangs.
  ipcMain.handle("updates:state", () => ({
    supported: canAutoUpdate,
    platform: process.platform,
    currentVersion: app.getVersion(),
    releasesUrl: RELEASES_URL,
    // macOS can check + notify but not self-install (see file header)
    canSelfInstall: canAutoUpdate && !isDarwin
  }));

  ipcMain.handle("updates:check", async () => {
    if (!canAutoUpdate) {
      send({ type: "not-available", reason: app.isPackaged ? "unsupported" : "dev", version: app.getVersion() });
      return { ok: false, reason: app.isPackaged ? "unsupported" : "dev" };
    }
    try {
      const r = await autoUpdater.checkForUpdates();
      return { ok: true, version: r?.updateInfo?.version || null };
    } catch (error) {
      send({ type: "error", message: String(error && error.message || error) });
      return { ok: false, error: String(error && error.message || error) };
    }
  });

  ipcMain.handle("updates:download", async () => {
    if (!canAutoUpdate) return { ok: false };
    if (isDarwin) {
      // Unsigned macOS: hand off to the browser for a manual .dmg.
      shell.openExternal(RELEASES_URL);
      send({ type: "manual", url: RELEASES_URL });
      return { ok: true, manual: true };
    }
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      send({ type: "error", message: String(error && error.message || error) });
      return { ok: false, error: String(error && error.message || error) };
    }
  });

  ipcMain.on("updates:install", () => {
    if (canAutoUpdate && !isDarwin) {
      // isSilent = false (show the NSIS UI), isForceRunAfter = true
      setImmediate(() => autoUpdater.quitAndInstall(false, true));
    } else {
      shell.openExternal(RELEASES_URL);
    }
  });

  ipcMain.on("updates:open-releases", () => shell.openExternal(RELEASES_URL));

  // App-content reload — the lightweight path when there's no new native
  // build, just fresh data / backend-driven changes to pick up.
  ipcMain.on("app:reload", () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.reloadIgnoringCache();
  });

  if (!canAutoUpdate) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => send({ type: "checking" }));
  autoUpdater.on("update-available", (info) =>
    send({
      type: "available",
      version: info.version,
      notes: typeof info.releaseNotes === "string" ? info.releaseNotes.slice(0, 4000) : null,
      canSelfInstall: !isDarwin
    })
  );
  autoUpdater.on("update-not-available", (info) => send({ type: "not-available", version: info && info.version }));
  autoUpdater.on("download-progress", (p) => send({ type: "progress", percent: Math.round(p.percent || 0) }));
  autoUpdater.on("update-downloaded", (info) => send({ type: "downloaded", version: info.version }));
  autoUpdater.on("error", (error) => send({ type: "error", message: String(error && error.message || error) }));

  // Passive checks: shortly after launch, then on an interval.
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), FIRST_CHECK_DELAY_MS);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), CHECK_INTERVAL_MS);
}

module.exports = { initUpdates, RELEASES_URL };
