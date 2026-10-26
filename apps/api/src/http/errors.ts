// Errors that map to the API error format (API_DESIGN.md section 2). Throw these from routes and
// services; the central error handler turns them into responses.

export type ErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "version_conflict"
  | "state_conflict"
  | "duplicate"
  | "payload_too_large"
  | "unsupported_media_type"
  | "rule_violation"
  | "precondition_failed"
  | "rate_limited"
  | "internal"
  | "database_unavailable"
  | "retry_later";

export interface FieldError {
  /** Where the problem is, e.g. "body.name" or "query.limit". */
  path: string;
  code: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fields?: FieldError[];

  constructor(status: number, code: ErrorCode, message: string, fields?: FieldError[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const notFound = (message = "We couldn't find what you asked for. Check the address and try again.") =>
  new ApiError(404, "not_found", message);

export const databaseUnavailable = () =>
  new ApiError(503, "database_unavailable", "The database is not reachable right now, so nothing was changed. Try again in a moment.");
