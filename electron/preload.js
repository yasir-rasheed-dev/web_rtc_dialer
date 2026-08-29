// Runs in an isolated world before the frontend's own JS, with
// contextIsolation on and nodeIntegration off (see main.js) — this is the
// only place allowed to touch Node/Electron APIs; anything the page needs
// must be explicitly exposed here via contextBridge.
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Same shape is loaded into BOTH the main window and the call popup window
// (see main.js's createWindow/createCallWindow, both point their
// webPreferences.preload at this file) — main.js relays the actual
// show/hide/state/command messages between them, so this file itself
// doesn't need to know which window it's running in.
contextBridge.exposeInMainWorld("ringnexDesktop", {
  version: process.versions.electron,
  platform: process.platform,
  callWindow: {
    show: () => ipcRenderer.send("call-window:show"),
    hide: () => ipcRenderer.send("call-window:hide"),
    // Main window -> popup: push a fresh call-state snapshot.
    sendState: (state) => ipcRenderer.send("call-window:state", state),
    // Popup: subscribe to those snapshots. Returns an unsubscribe function.
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("call-window:state", listener);
      return () => ipcRenderer.removeListener("call-window:state", listener);
    },
    // Popup -> main window: "the user clicked answer/hangup/mute/etc."
    sendCommand: (command, payload) => ipcRenderer.send("call-window:command", { command, payload }),
    // Main window: subscribe to those commands. Returns an unsubscribe function.
    onCommand: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("call-window:command", listener);
      return () => ipcRenderer.removeListener("call-window:command", listener);
    },
    // Main window -> popup: outcome of a command that can actually fail in
    // a way the popup should show inline (currently just blind transfer —
    // DTMF/mute/hold/etc are fire-and-forget, same as the in-page UI).
    sendCommandResult: (result) => ipcRenderer.send("call-window:command-result", result),
    // Popup: subscribe to those outcomes. Returns an unsubscribe function.
    onCommandResult: (callback) => {
      const listener = (_event, result) => callback(result);
      ipcRenderer.on("call-window:command-result", listener);
      return () => ipcRenderer.removeListener("call-window:command-result", listener);
    }
  }
});
