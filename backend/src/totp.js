import { authenticator } from "otplib";
import QRCode from "qrcode";

// Real phones drift by a few minutes when their clock isn't synced (Google
// Authenticator dropped its own "time correction" setting in newer builds,
// so there's no app-side fix for that). Brute-forcing is still bounded by
// the login rate limiter (8 attempts/15min), not by how narrow this window
// is, so widening it trades effectively no security for real usability.
authenticator.options = { window: 8 }; // accept +/- 8 steps (~4 minutes) of drift

export function generateTotpSecret() {
  return authenticator.generateSecret();
}

export function verifyTotpCode(secret, code) {
  try {
    return authenticator.verify({ token: String(code || "").trim(), secret });
  } catch {
    return false;
  }
}

export async function totpQrCodeDataUrl(secret, accountLabel, issuer = "Ringnex") {
  const otpauthUrl = authenticator.keyuri(accountLabel, issuer, secret);
  const qr = await QRCode.toDataURL(otpauthUrl);
  return { otpauthUrl, qr };
}
