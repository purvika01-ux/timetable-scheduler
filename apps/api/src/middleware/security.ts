// Security headers and request-shape rules (SECURITY_MODEL.md sections 5 and 6).

import cors from "cors";
import type { RequestHandler } from "express";
import helmet from "helmet";

import { ApiError } from "../http/errors.ts";

/** Headers for a JSON-only API: nothing may be framed, scripted or sniffed. */
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  crossOriginResourcePolicy: { policy: "same-site" },
  referrerPolicy: { policy: "no-referrer" },
});

/**
 * CORS for an explicit list of exact origins. Requests from other origins get no CORS headers, so
 * browsers refuse to share the response. Credentials are not allowed until sign-in exists (Phase 5).
 */
export function corsPolicy(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return cors({
    origin: (origin, callback) => callback(null, origin !== undefined && allowed.has(origin)),
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Request-Id", "If-None-Match"],
    exposedHeaders: ["X-Request-Id", "ETag", "Retry-After"],
    credentials: false,
    maxAge: 600,
    optionsSuccessStatus: 204,
  });
}

/** Requests that carry a body must send JSON; anything else is refused before it is parsed. */
export const requireJsonBody: RequestHandler = (req, _res, next) => {
  const hasBody = Number(req.get("content-length") ?? 0) > 0 || req.get("transfer-encoding") !== undefined;
  if (hasBody && !req.is("application/json")) {
    next(new ApiError(415, "unsupported_media_type", "Send the request body as JSON (Content-Type: application/json)."));
    return;
  }
  next();
};
