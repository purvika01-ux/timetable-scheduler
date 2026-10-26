// Every request gets an id, returned in the X-Request-Id header and in every response body, so a
// user can quote it and support can find the matching log lines.

import { randomUUID } from "node:crypto";

import type { RequestHandler } from "express";

/** Accept a caller's id only if it is a short, safe token; otherwise make our own. */
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get("x-request-id");
  const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
};
