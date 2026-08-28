// Resolves the origin the app talks to for /api and /socket.io calls.
//
// - Normal web deployment (vite dev server or the production static build
//   served same-origin with the backend): "" — every call stays relative,
//   exactly as before this existed. Nothing changes for the browser build.
// - Electron desktop build: the frontend is loaded from the custom
//   "app://myaiobyoc" scheme (see electron/main.js), which is a different
//   origin than the backend, so calls need an absolute URL. That URL is
//   baked in at build time via VITE_API_BASE_URL — see frontend/.env.electron
//   and the "build:electron" script in package.json.
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
