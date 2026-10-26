// The last middleware: every error becomes a consistent, safe response. Unexpected errors are
// logged in full but the caller only sees a generic message and the request id.

import type { ErrorRequestHandler, RequestHandler } from "express";

import { isDatabaseUnavailableError } from "../db/connection.ts";
import { ApiError } from "../http/errors.ts";
import { sendError } from "../http/response.ts";
import type { Logger } from "../logger.ts";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, "not_found", `There is no ${req.method} ${req.path} in this API. Check the address and the method.`));
};

/** Errors raised by express.json() carry a `type`; map the ones a client can cause. */
function bodyParserError(err: unknown): ApiError | null {
  const type = (err as { type?: unknown })?.type;
  if (type === "entity.parse.failed") return new ApiError(400, "bad_request", "The request body is not valid JSON.");
  if (type === "entity.too.large") return new ApiError(413, "payload_too_large", "The request body is too large. The limit is 1 MB.");
  if (type === "encoding.unsupported" || type === "charset.unsupported") {
    return new ApiError(415, "unsupported_media_type", "Send the request body as UTF-8 JSON.");
  }
  return null;
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const known =
      err instanceof ApiError
        ? err
        : (bodyParserError(err) ??
          (isDatabaseUnavailableError(err)
            ? new ApiError(503, "database_unavailable", "The database is not reachable right now, so nothing was changed. Try again in a moment.")
            : null));
    if (known) {
      if (known.status >= 500) logger.warn({ requestId: res.locals.requestId, code: known.code, err }, "request failed");
      if (known.status === 503) res.setHeader("Retry-After", "5");
      sendError(res, known.status, known.code, known.message, known.fields);
      return;
    }
    logger.error({ requestId: res.locals.requestId, err }, "unhandled error");
    sendError(res, 500, "internal", "Something went wrong on our side. Nothing was changed. If it keeps happening, quote the request id.");
  };
}
