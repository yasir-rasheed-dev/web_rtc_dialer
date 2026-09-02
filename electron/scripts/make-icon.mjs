// Generate the desktop-app icon from the ringNex wordmark.
//
//   node scripts/make-icon.mjs
//
// Produces electron/build/icon.ico (multi-res: 256..16) and icon.png (512).
// The source logo is a wide lockup, so it's scaled to fit the width and
// centred on a square transparent canvas.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "../../frontend/src/assets/ringnex.png");
const OUT_DIR = path.resolve(here, "../build");
const MASTER = 512;
const WIDTH_RATIO = 0.9; // logo width as a fraction of the canvas
const SIZES = [256, 128, 64, 48, 32, 16];

async function buildMaster() {
  const targetW = Math.round(MASTER * WIDTH_RATIO);
  const logo = await sharp(SRC)
    .resize({ width: targetW, fit: "inside", withoutEnlargement: false })
    .toBuffer();
  const meta = await sharp(logo).metadata();
  const top = Math.max(0, Math.round((MASTER - meta.height) / 2));
  const left = Math.max(0, Math.round((MASTER - meta.width) / 2));

  return sharp({
    create: { width: MASTER, height: MASTER, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: logo, top, left }])
    .png()
    .toBuffer();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const master = await buildMaster();
  await writeFile(path.join(OUT_DIR, "icon.png"), master);

  const frames = await Promise.all(
    SIZES.map((s) => sharp(master).resize(s, s, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer())
  );
  const ico = await pngToIco(frames);
  await writeFile(path.join(OUT_DIR, "icon.ico"), ico);

  console.log(`[make-icon] wrote ${path.join(OUT_DIR, "icon.ico")} (${SIZES.join(", ")}) and icon.png (${MASTER})`);
}

main().catch((err) => {
  console.error("[make-icon] failed:", err);
  process.exit(1);
});
