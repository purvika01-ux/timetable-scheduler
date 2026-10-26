// Rate limits for sensitive endpoints (SECURITY_MODEL.md section 8, D19 values accepted in M19).

import type { RequestHandler } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

import { MongoRateLimitStore } from "../db/rate-limit-store.ts";
import type { Deps } from "../deps.ts";
import { sendError } from "../http/response.ts";

export const LIMITS = {
  login: { windowMs: 60_000, limit: 10 },
  mfa: { windowMs: 15 * 60_000, limit: 10 },
  refresh: { windowMs: 60 * 60_000, limit: 60 },
  registration: { windowMs: 60 * 60_000, limit: 5 },
  invitation: { windowMs: 60 * 60_000, limit: 10 },
  passwordReset: { windowMs: 60 * 60_000, limit: 10 },
  authenticated: { windowMs: 60_000, limit: 600 },
} as const;

export type LimitName = keyof typeof LIMITS;

/** Per-IP limiter (IPv6 addresses grouped by /56) with the API's error format. */
export function limiter(deps: Pick<Deps, "models" | "now">, name: LimitName, keyBy: "ip" | "user" = "ip"): RequestHandler {
  const { windowMs, limit } = LIMITS[name];
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    store: new MongoRateLimitStore(deps.models, `rl:${name}`, deps.now),
    keyGenerator: (req, res) => (keyBy === "user" && res.locals.auth ? String(res.locals.auth.userId) : ipKeyGenerator(req.ip ?? "unknown")),
    handler: (_req, res, _next, options) => {
      res.setHeader("Retry-After", String(Math.ceil(options.windowMs / 1000)));
      sendError(res, 429, "rate_limited", "Too many attempts. Wait a little and try again.");
    },
  });
}
