const isProd = process.env.NODE_ENV === "production";

function requireEnv(key: string, minLength = 0): string {
  const val = process.env[key];
  if (!val) {
    const msg = `Missing required environment variable: ${key}`;
    if (isProd) {
      console.error(`FATAL: ${msg}`);
      process.exit(1);
    }
    console.warn(`WARNING: ${msg} — using insecure default for local dev`);
    return "";
  }
  if (minLength > 0 && val.length < minLength) {
    const msg = `Environment variable ${key} must be at least ${minLength} characters (got ${val.length})`;
    if (isProd) {
      console.error(`FATAL: ${msg}`);
      process.exit(1);
    }
    console.warn(`WARNING: ${msg}`);
  }
  return val;
}

// Validated at module load — imported before express binds.
const SESSION_SECRET = requireEnv("SESSION_SECRET", 32) || "dev-secret-change-me-32-chars!!";

export function getSessionSecret(): string {
  return SESSION_SECRET;
}
