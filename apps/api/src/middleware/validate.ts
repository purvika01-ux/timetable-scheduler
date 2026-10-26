// Request validation with Zod: path parameters, query string and body are each checked against a
// schema before the handler runs. Parsed values are available as req.valid; the raw req.params,
// req.query and req.body are never used by handlers.

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";

import { ApiError, type FieldError } from "../http/errors.ts";

export interface RequestSchemas<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType> {
  params?: P;
  query?: Q;
  body?: B;
}

declare module "express-serve-static-core" {
  interface Request {
    /** Values parsed by `validate`; typed per route through `valid(req, schemas)`. */
    valid?: { params: unknown; query: unknown; body: unknown };
  }
}

function toFieldErrors(part: "params" | "query" | "body", error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: [part, ...issue.path.map(String)].join("."),
    code: issue.code,
    message: issue.message,
  }));
}

/**
 * Validate a request. Unknown keys are refused when a schema is a strict object, so callers cannot
 * slip extra fields (such as MongoDB operators) past the API.
 */
export function validate<P extends z.ZodType = z.ZodType, Q extends z.ZodType = z.ZodType, B extends z.ZodType = z.ZodType>(
  schemas: RequestSchemas<P, Q, B>,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const fields: FieldError[] = [];
    const parsed: { params: unknown; query: unknown; body: unknown } = { params: undefined, query: undefined, body: undefined };
    for (const part of ["params", "query", "body"] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(part === "body" ? (req.body ?? {}) : req[part]);
      if (result.success) parsed[part] = result.data;
      else fields.push(...toFieldErrors(part, result.error));
    }
    if (fields.length > 0) {
      next(new ApiError(400, "validation_failed", "Some of the information sent is missing or not in the right form. See the fields listed.", fields));
      return;
    }
    req.valid = parsed;
    next();
  };
}

/** Typed access to what `validate` parsed for this route. */
export function valid<P extends z.ZodType = z.ZodType, Q extends z.ZodType = z.ZodType, B extends z.ZodType = z.ZodType>(
  req: Request,
  _schemas: RequestSchemas<P, Q, B>,
): { params: z.infer<P>; query: z.infer<Q>; body: z.infer<B> } {
  if (!req.valid) throw new Error("valid() called on a route without validate()");
  return req.valid as { params: z.infer<P>; query: z.infer<Q>; body: z.infer<B> };
}
