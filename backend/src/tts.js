// Free, offline text-to-speech for IVR prompts via eSpeak NG — no API key,
// no billing account, no per-use cost. Requires `espeak-ng` installed on
// whichever machine runs this backend (e.g. `apt install espeak-ng` on
// Debian/Ubuntu, or `winget install eSpeak-NG.eSpeak-NG` on Windows); if
// it isn't present, synthesis is skipped (not fatal — the IVR/campaign
// still saves, just without audio until espeak-ng is installed and the
// prompt is saved again).
//
// eSpeak NG's -w output is 22050Hz mono — not the 8kHz telephony rate
// Asterisk/PSTN codecs actually use — so it's resampled via `ffmpeg`
// (also required on PATH) before anything gets used or shipped anywhere.
//
// Generated WAV files live under AUDIO_ROOT, content-hashed so identical
// prompt text (even across tenants/IVRs) reuses one file instead of
// regenerating it. Asterisk's Playback()/Read() need this file reachable
// from the Asterisk box itself — the backend and Asterisk are commonly two
// different machines (they are in this deployment: backend runs locally,
// Asterisk is remote), so after resampling, the file is pushed via `scp`
// (needs its own passwordless SSH key — see ASTERISK_SOUNDS_SSH_KEY below)
// into Asterisk's sounds/en/custom/ directory. If that push fails or isn't
// configured, synthesis still succeeds locally (AUDIO_ROOT keeps the file)
// but the IVR plays silently until the file actually reaches the box —
// same "never block the save on the live-infra step" pattern as
// tollFreeRoutes.js's trySync.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const AUDIO_ROOT = path.resolve(here, "..", "tts-audio");

// Where Asterisk should find the synced file, e.g. "5.78.77.240". Sync is
// skipped (not an error) if this isn't set — matches how espeak-ng itself
// being absent just skips synthesis rather than failing the save.
const SOUNDS_HOST = process.env.ASTERISK_SOUNDS_HOST || "";
const SOUNDS_SSH_USER = process.env.ASTERISK_SOUNDS_SSH_USER || "root";
const SOUNDS_SSH_KEY = process.env.ASTERISK_SOUNDS_SSH_KEY || "";
const SOUNDS_REMOTE_DIR =
  process.env.ASTERISK_SOUNDS_REMOTE_DIR || "/opt/ringnex-webrtc/var/lib/asterisk/sounds/en/custom";

let espeakChecked = false;
let espeakAvailable = false;
let ffmpegChecked = false;
let ffmpegAvailable = false;

function probe(command, args) {
  return new Promise((resolve) => {
    const proc = spawn(command, args);
    proc.on("error", () => resolve(false));
    proc.on("exit", (code) => resolve(code === 0));
  });
}

async function checkEspeakAvailable() {
  if (espeakChecked) return espeakAvailable;
  espeakChecked = true;
  espeakAvailable = await probe("espeak-ng", ["--version"]);
  if (!espeakAvailable) {
    console.warn(
      "[tts] espeak-ng not found on PATH — IVR prompts will save without audio " +
      "until it's installed on this host and the prompt is saved again."
    );
  }
  return espeakAvailable;
}

async function checkFfmpegAvailable() {
  if (ffmpegChecked) return ffmpegAvailable;
  ffmpegChecked = true;
  ffmpegAvailable = await probe("ffmpeg", ["-version"]);
  if (!ffmpegAvailable) {
    console.warn(
      "[tts] ffmpeg not found on PATH — IVR prompts will save without audio " +
      "(eSpeak NG's raw output isn't in Asterisk's 8kHz telephony format, so " +
      "ffmpeg is required to resample it, not optional)."
    );
  }
  return ffmpegAvailable;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    let stderr = "";
    proc.stderr?.on("data", (chunk) => { stderr += chunk; });
    proc.on("error", reject);
    proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-300)}`))));
  });
}

// Pushes an already-synthesized file to the Asterisk box. Never throws —
// a sync failure is logged and reported back up (see pushToAsterisk's
// caller), the same "log it, don't lose the save" pattern as everything
// else touching live infra in this feature.
async function pushToAsterisk(localPath, filename) {
  if (!SOUNDS_HOST || !SOUNDS_SSH_KEY) {
    return { ok: false, error: "ASTERISK_SOUNDS_HOST/ASTERISK_SOUNDS_SSH_KEY not configured — audio stays local only" };
  }
  try {
    await run("scp", [
      "-i", SOUNDS_SSH_KEY,
      "-o", "StrictHostKeyChecking=accept-new",
      "-o", "ConnectTimeout=10",
      localPath,
      `${SOUNDS_SSH_USER}@${SOUNDS_HOST}:${SOUNDS_REMOTE_DIR}/${filename}`
    ]);
    // Uploaded as whatever user owns the SSH key (commonly root); Asterisk
    // runs as a different, less-privileged user, so make sure it can at
    // least read the file (the directory itself is already 755).
    await run("ssh", [
      "-i", SOUNDS_SSH_KEY,
      "-o", "ConnectTimeout=10",
      `${SOUNDS_SSH_USER}@${SOUNDS_HOST}`,
      `chmod 644 ${SOUNDS_REMOTE_DIR}/${filename}`
    ]);
    return { ok: true, error: null };
  } catch (error) {
    console.error("[tts] scp to Asterisk sounds dir failed:", error.message);
    return { ok: false, error: error.message };
  }
}

// Renders `text` to a WAV file, resamples it to 8kHz mono for Asterisk,
// pushes it to the Asterisk box, and returns "custom/<hash>" (the path
// Asterisk's Playback()/Read() expect: relative to sounds/en/, no
// extension) — or null if espeak-ng/ffmpeg aren't available or synthesis
// failed outright. A failed *sync* (network/SSH) still returns the path —
// the file exists locally and will reach Asterisk on a later retry/resave,
// same as every other Asterisk-sync failure in this feature.
export async function synthesizeToFile(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  if (!(await checkEspeakAvailable())) return null;
  if (!(await checkFfmpegAvailable())) return null;

  await fs.promises.mkdir(AUDIO_ROOT, { recursive: true });
  const hash = crypto.createHash("sha1").update(trimmed).digest("hex").slice(0, 24);
  const wavPath = path.join(AUDIO_ROOT, `${hash}.wav`);
  const rawPath = path.join(AUDIO_ROOT, `${hash}.raw.wav`);
  const filename = `${hash}.wav`;

  if (!fs.existsSync(wavPath)) {
    try {
      await run("espeak-ng", ["-w", rawPath, "-s", "150", trimmed]);
      await run("ffmpeg", ["-y", "-i", rawPath, "-ar", "8000", "-ac", "1", "-sample_fmt", "s16", wavPath]);
    } catch (error) {
      console.error("[tts] synthesis failed:", error.message);
      return null;
    } finally {
      await fs.promises.rm(rawPath, { force: true }).catch(() => {});
    }
    if (!fs.existsSync(wavPath)) return null;
  }

  const sync = await pushToAsterisk(wavPath, filename);
  if (!sync.ok) console.warn(`[tts] audio for this prompt is not yet on the Asterisk box: ${sync.error}`);

  return `custom/${hash}`;
}
