// The two response shapes every endpoint uses (API_DESIGN.md sections 1 and 2):
//   success: { "data": ..., "meta": { "requestId": "..." } }
//   error:   { "error": { "code", "message", "fields"?, "issues"?, "requestId" } }

import type { Response } from "express";

import type { ErrorCode, FieldError, RuleIssue } from "./errors.ts";

export interface SuccessBody<T> {
  data: T;
  meta: { requestId: string };
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string; fields?: FieldError[]; issues?: RuleIssue[]; requestId: string };
}

export function requestIdOf(res: Response): string {
  return String(res.locals.requestId ?? "");
}

export function sendData<T>(res: Response, data: T, status = 200): void {
  const body: SuccessBody<T> = { data, meta: { requestId: requestIdOf(res) } };
  res.status(status).json(body);
}

export function sendError(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
  fields?: FieldError[],
  issues?: RuleIssue[],
): void {
  const body: ErrorBody = {
    error: {
      code,
      message,
      ...(fields && fields.length > 0 ? { fields } : {}),
      ...(issues && issues.length > 0 ? { issues } : {}),
      requestId: requestIdOf(res),
    },
  };
  res.status(status).json(body);
}
