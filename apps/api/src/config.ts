// Environment configuration, parsed and validated once at startup. Invalid configuration stops the
// process with a message naming each bad variable; secret values are never echoed.

import { z } from "zod";

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

/** One exact browser origin such as https://app.example.edu (scheme, host and optional port; no path). */
const origin = z.string().refine(
  (value) => {
    try {
      const url = new URL(value);
      return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
    } catch {
      return false;
    }
  },
  { message: "must be an exact origin such as https://app.example.edu (no path, no trailing slash, no wildcard)" },
);

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(0).max(65535).default(4000),
    MONGODB_URI: z
      .string({ error: "is required" })
      .min(1, { error: "is required" })
      .refine((v) => v.startsWith("mongodb://") || v.startsWith("mongodb+srv://"), {
        message: "must start with mongodb:// or mongodb+srv://",
      }),
    CORS_ORIGINS: z
      .string()
      .default("")
      .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
      .pipe(z.array(origin)),
    LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(10_000),
    DB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
    // Sign-in (SECURITY_MODEL.md section 2). Generate keys with `npm run keys:generate`.
    AUTH_JWT_PRIVATE_KEY: z.string({ error: "is required (run npm run keys:generate)" }).min(1, { error: "is required (run npm run keys:generate)" }),
    AUTH_JWT_KEY_ID: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/, { message: "must be 1 to 40 letters, digits, dots, dashes or underscores" }).default("k1"),
    AUTH_JWT_PREVIOUS_KEYS: z.string().default(""),
    MFA_ENCRYPTION_KEY: z
      .string({ error: "is required (run npm run keys:generate)" })
      .refine((v) => Buffer.from(v, "base64").length === 32, { message: "must be 32 bytes, base64-encoded (run npm run keys:generate)" }),
    PUBLIC_APP_URL: origin.default("http://localhost:3000"),
    COOKIE_SECURE: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
    STAFF_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(60).default(1_800),
    STAFF_MAX_SESSION_SECONDS: z.coerce.number().int().min(300).default(43_200),
    OTHER_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(60).default(604_800),
    OTHER_MAX_SESSION_SECONDS: z.coerce.number().int().min(300).default(2_592_000),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV === "production" && cfg.CORS_ORIGINS.length === 0) {
      ctx.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "must list at least one origin in production" });
    }
  });

export interface Config {
  env: "development" | "test" | "production";
  host: string;
  port: number;
  mongoUri: string;
  corsOrigins: string[];
  logLevel: (typeof LOG_LEVELS)[number];
  trustProxy: number;
  shutdownTimeoutMs: number;
  dbServerSelectionTimeoutMs: number;
  auth: {
    privateKeyPem: string;
    keyId: string;
    /** Public keys still accepted while their tokens expire after a key rotation. */
    previousPublicKeys: { keyId: string; publicKeyPem: string }[];
    mfaEncryptionKey: Buffer;
    publicAppUrl: string;
    cookieSecure: boolean;
    accessTokenTtlSeconds: number;
    staff: { idleSeconds: number; maxSeconds: number };
    other: { idleSeconds: number; maxSeconds: number };
  };
}

export class ConfigError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

/** Parse configuration from an environment object (process.env in production, a plain object in tests). */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    // Name the variable and the rule it broke; never include the value (it may be a secret).
    throw new ConfigError(result.error.issues.map((i) => `${i.path.join(".") || "environment"} ${i.message}`));
  }
  const c = result.data;
  return {
    env: c.NODE_ENV,
    host: c.HOST,
    port: c.PORT,
    mongoUri: c.MONGODB_URI,
    corsOrigins: c.CORS_ORIGINS,
    logLevel: c.LOG_LEVEL,
    trustProxy: c.TRUST_PROXY,
    shutdownTimeoutMs: c.SHUTDOWN_TIMEOUT_MS,
    dbServerSelectionTimeoutMs: c.DB_SERVER_SELECTION_TIMEOUT_MS,
    auth: {
      privateKeyPem: decodePem(c.AUTH_JWT_PRIVATE_KEY),
      keyId: c.AUTH_JWT_KEY_ID,
      previousPublicKeys: parsePreviousKeys(c.AUTH_JWT_PREVIOUS_KEYS),
      mfaEncryptionKey: Buffer.from(c.MFA_ENCRYPTION_KEY, "base64"),
      publicAppUrl: c.PUBLIC_APP_URL,
      cookieSecure: c.COOKIE_SECURE,
      accessTokenTtlSeconds: c.ACCESS_TOKEN_TTL_SECONDS,
      staff: { idleSeconds: c.STAFF_IDLE_TIMEOUT_SECONDS, maxSeconds: c.STAFF_MAX_SESSION_SECONDS },
      other: { idleSeconds: c.OTHER_IDLE_TIMEOUT_SECONDS, maxSeconds: c.OTHER_MAX_SESSION_SECONDS },
    },
  };
}

/** Keys are stored base64-encoded so a PEM fits on one line in .env files. */
function decodePem(value: string): string {
  // A raw PEM may arrive with literal "\n" sequences when written on one line.
  return value.includes("-----BEGIN") ? value.replaceAll("\\n", "\n") : Buffer.from(value, "base64").toString("utf8");
}

/** "kid1=base64pem,kid2=base64pem" */
function parsePreviousKeys(value: string): { keyId: string; publicKeyPem: string }[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const at = pair.indexOf("=");
      if (at <= 0) throw new ConfigError(["AUTH_JWT_PREVIOUS_KEYS must look like keyId=base64PublicKey,keyId=base64PublicKey"]);
      return { keyId: pair.slice(0, at), publicKeyPem: decodePem(pair.slice(at + 1)) };
    });
}
