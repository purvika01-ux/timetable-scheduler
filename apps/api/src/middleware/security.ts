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
 * browsers refuse to share the response. Credentials (the refresh cookie) are allowed only under the
 * cookie's path, so every other route stays bearer-only (SECURITY_MODEL.md section 6).
 */
export function corsPolicy(allowedOrigins: string[], credentialsPath: string): RequestHandler {
  const allowed = new Set(allowedOrigins);
  const base = {
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Request-Id", "If-None-Match", "X-CSRF-Protection"],
    exposedHeaders: ["X-Request-Id", "ETag", "Retry-After"],
    maxAge: 600,
    optionsSuccessStatus: 204,
  };
  return cors((req, callback) => {
    const origin = req.headers.origin;
    const path = (req as { path?: string }).path ?? "";
    callback(null, {
      ...base,
      origin: origin !== undefined && allowed.has(origin),
      credentials: path === credentialsPath || path.startsWith(`${credentialsPath}/`),
    });
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
