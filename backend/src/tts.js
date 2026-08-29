// Free, offline text-to-speech for IVR prompts via eSpeak NG — no API key,
// no billing account, no per-use cost. Requires `espeak-ng` installed on
// whichever machine runs this backend (e.g. `apt install espeak-ng` on
// Debian/Ubuntu); if it isn't present, synthesis is skipped (not fatal —
// the IVR/campaign still saves, just without audio until espeak-ng is
// installed and the prompt is saved again).
//
// Generated WAV files live under AUDIO_ROOT, content-hashed so identical
// prompt text (even across tenants/IVRs) reuses one file instead of
// regenerating it. Asterisk's Playback() app needs this same folder
// reachable from the Asterisk box — either the backend and Asterisk share
// a filesystem/mount, or a deployment step syncs AUDIO_ROOT into
// Asterisk's sounds directory. See backend/asterisk/toll-free-routing-
// snippet.conf for the dialplan side of this.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const AUDIO_ROOT = path.resolve(here, "..", "tts-audio");

let availabilityChecked = false;
let available = false;

async function checkAvailable() {
  if (availabilityChecked) return available;
  availabilityChecked = true;
  available = await new Promise((resolve) => {
    const probe = spawn("espeak-ng", ["--version"]);
    probe.on("error", () => resolve(false));
    probe.on("exit", (code) => resolve(code === 0));
  });
  if (!available) {
    console.warn(
      "[tts] espeak-ng not found on PATH — IVR prompts will save without audio " +
      "until it's installed on this host and the prompt is saved again."
    );
  }
  return available;
}

// Renders `text` to a WAV file and returns its content hash (the filename,
// no extension — matches how Asterisk's Playback() itself expects a
// path/filename without extension), or null if espeak-ng isn't available
// or synthesis failed.
export async function synthesizeToFile(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  if (!(await checkAvailable())) return null;

  await fs.promises.mkdir(AUDIO_ROOT, { recursive: true });
  const hash = crypto.createHash("sha1").update(trimmed).digest("hex").slice(0, 24);
  const wavPath = path.join(AUDIO_ROOT, `${hash}.wav`);

  if (fs.existsSync(wavPath)) return hash;

  try {
    await new Promise((resolve, reject) => {
      // -w writes to a file instead of speaking aloud. Output sample
      // rate/format may need a `sox`-based resample to 8kHz mono for
      // best quality over the PSTN codec path — left as a follow-up
      // rather than adding a second external dependency for v1.
      const proc = spawn("espeak-ng", ["-w", wavPath, "-s", "150", trimmed]);
      proc.on("error", reject);
      proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`espeak-ng exited with code ${code}`))));
    });
  } catch (error) {
    console.error("[tts] synthesis failed:", error.message);
    return null;
  }

  return fs.existsSync(wavPath) ? hash : null;
}
