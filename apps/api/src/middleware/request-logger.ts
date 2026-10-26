// One structured log line per request: method, route, status, duration and request id. Headers that
// carry credentials are redacted and bodies are never logged.

import type { RequestHandler } from "express";
import { pinoHttp } from "pino-http";

import type { Logger } from "../logger.ts";

export function requestLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (_req, res) => String(res.getHeader("X-Request-Id") ?? ""),
    customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
    serializers: {
      req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  });
}
