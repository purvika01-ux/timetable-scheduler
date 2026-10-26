// Structured JSON logging. Personal data, credentials and request bodies are never logged
// (SECURITY_MODEL.md section 7).

import { pino, type Logger } from "pino";

import type { Config } from "./config.ts";

export type { Logger };

export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  "*.password",
  "*.token",
  "*.mongoUri",
];

export function createLogger(config: Pick<Config, "logLevel" | "env">): Logger {
  return pino({
    level: config.logLevel,
    base: { service: "timetable-api", env: config.env },
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
