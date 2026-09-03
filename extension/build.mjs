// Bundles the SIP engine (src/offscreen.js + sip.js) into a single
// offscreen.bundle.js that the offscreen document loads as a plain
// <script>. Run: npm install && npm run build
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/offscreen.js"],
  bundle: true,
  format: "iife",
  target: "chrome116",
  platform: "browser",
  outfile: "offscreen.bundle.js",
  minify: true,
  legalComments: "none",
  logLevel: "info"
});

console.log("✓ offscreen.bundle.js");
