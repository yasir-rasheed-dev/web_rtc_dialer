// Side-effect import placed FIRST in every backend test file, so config.js
// (which throws on missing/unsafe env) can be imported in CI where there's
// no .env. Only fills values that aren't already set, so a local run with
// a real .env is untouched.
const defaults = {
  NODE_ENV: "test",
  PORT: "3199",
  JWT_SECRET: "test-jwt-secret-not-for-production-use-only",
  // base64 of 32 zero bytes — decodes to exactly 32 bytes as config requires
  SIP_CREDENTIAL_KEY: Buffer.alloc(32).toString("base64"),
  DB_USER: "test",
  DB_PASSWORD: "test",
  DB_NAME: "ringnex_test",
  AMI_USERNAME: "test",
  AMI_SECRET: "test",
  REFRESH_TOKEN_TTL_DAYS: "30"
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) process.env[key] = value;
}
