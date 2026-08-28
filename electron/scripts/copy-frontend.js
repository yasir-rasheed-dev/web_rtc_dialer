// Copies the built frontend (frontend/dist, built with
// `npm run build:electron`) into electron/app/, which electron-builder then
// packages via the "files" entry in package.json's build config, and which
// `npm start` also reads directly for a quick local check without a full
// electron-builder pass.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "..", "frontend", "dist");
const DEST = path.join(__dirname, "..", "app");

if (!fs.existsSync(SRC)) {
  console.error(
    `[copy-frontend] ${SRC} does not exist yet.\n` +
      "Run this first:  npm --prefix ../frontend run build:electron"
  );
  process.exit(1);
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.cpSync(SRC, DEST, { recursive: true });
console.log(`[copy-frontend] copied ${SRC} -> ${DEST}`);
