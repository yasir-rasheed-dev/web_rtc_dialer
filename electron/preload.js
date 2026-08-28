// Runs in an isolated world before the frontend's own JS, with
// contextIsolation on and nodeIntegration off (see main.js) — this is the
// only place allowed to touch Node/Electron APIs; anything the page needs
// must be explicitly exposed here via contextBridge.
"use strict";

const { contextBridge } = require("electron");

// Not required by anything today — the frontend doesn't read this yet —
// but it's a harmless, ready-made hook if you ever want the UI to detect
// "I'm running in the desktop app" (e.g. to show a custom titlebar, an
// "About"/"Check for updates" entry, etc.) without touching main.js again.
contextBridge.exposeInMainWorld("ringnexDesktop", {
  version: process.versions.electron,
  platform: process.platform
});
