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
  };
}
