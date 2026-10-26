// Typed client for the College Timetable Optimizer API (`apps/api`, REST under /api/v1).
//
// Usage:
//   const api = createApiClient({ baseUrl: apiBaseUrlFromEnv() ?? "http://localhost:4000" });
//   const health = await api.getHealth();              // HealthReport, even when the API says 503
//   const data = await api.request<Thing>("/things");   // unwraps { data, meta }
//
// Behaviour:
// - Success responses are `{ data, meta: { requestId } }`; `request` returns `data`.
// - Error responses are `{ error: { code, message, fields?, requestId } }`; `request` throws an
//   `ApiRequestError` carrying them, so screens can show `message` and the request id.
// - Network failures, timeouts and 502/503/504 are retried with backoff for GET and HEAD only.
//   Mutating requests carry an `Idempotency-Key` header but are not retried automatically yet: the
//   API stores idempotency results from Phase 5 onwards (API_DESIGN.md section 1).
// - No credentials or tokens are sent or stored here; sign-in arrives in Phase 5 (access token in
//   memory only, SECURITY_MODEL.md section 2.4).
//
// The response types mirror apps/api/src/http/response.ts and services/health.service.ts. They
// move to a shared contracts package in Phase 2 (ARCHITECTURE.md section 3.4).

export const API_PREFIX = "/api/v1";

export interface FieldError {
  path: string;
  code: string;
  message: string;
}

export interface SuccessBody<T> {
  data: T;
  meta: { requestId: string };
}

export interface ErrorBody {
  error: { code: string; message: string; fields?: FieldError[]; requestId: string };
}

export interface HealthReport {
  status: "ok" | "degraded";
  api: { status: "up"; version: string; uptimeSeconds: number };
  database: {
    status: "up" | "down";
    state: "connected" | "connecting" | "disconnected" | "disconnecting";
    latencyMs?: number;
    reason?: string;
    schemaReady?: boolean;
  };
  checkedAt: string;
}

/** Codes from the API plus client-side ones: network_error, timeout, bad_response, aborted. */
export class ApiRequestError extends Error {
  /** HTTP status, or 0 when no response arrived. */
  readonly status: number;
  readonly code: string;
  readonly fields: FieldError[];
  readonly requestId: string | null;

  constructor(status: number, code: string, message: string, fields: FieldError[] = [], requestId: string | null = null) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.requestId = requestId;
  }

  /** True when trying again later may succeed (no response, timeout, or the server said "busy"). */
  get retryable(): boolean {
    return this.status === 0 ? this.code !== "aborted" : [502, 503, 504].includes(this.status);
  }
}

type Method = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  method?: Method;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Sent as JSON. */
  body?: unknown;
  signal?: AbortSignal;
  /** Overrides the client default. */
  timeoutMs?: number;
  /** For mutating requests; generated when omitted. Reuse the same key when retrying by hand. */
  idempotencyKey?: string;
  /** Statuses whose body is `{ data }` and should be returned rather than thrown (e.g. 503 from health). */
  acceptStatuses?: number[];
}

export interface ApiClientOptions {
  /** Origin of the API, e.g. "http://localhost:4000". A trailing slash is ignored. */
  baseUrl: string;
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Extra attempts for GET and HEAD after a retryable failure. */
  retries?: number;
  retryDelayMs?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  randomId?: () => string;
}

/** The API origin configured for this build (NEXT_PUBLIC_API_BASE_URL), or null when not set. */
export function apiBaseUrlFromEnv(env: Record<string, string | undefined> = { NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL }): string | null {
  const raw = env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

const RETRY_STATUSES = new Set([502, 503, 504]);
const MAX_RETRY_AFTER_MS = 10_000;

function isSuccessBody(value: unknown): value is SuccessBody<unknown> {
  return typeof value === "object" && value !== null && "data" in value;
}

function isErrorBody(value: unknown): value is ErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const e = (value as { error: unknown }).error;
  return typeof e === "object" && e !== null && typeof (e as { code?: unknown }).code === "string" && typeof (e as { message?: unknown }).message === "string";
}

export function createApiClient(options: ApiClientOptions) {
  const base = options.baseUrl.replace(/\/+$/, "") + API_PREFIX;
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = options.timeoutMs ?? 10_000;
  const retries = options.retries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 300;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const randomId = options.randomId ?? (() => globalThis.crypto.randomUUID());

  function urlFor(path: string, query?: RequestOptions["query"]): string {
    if (!path.startsWith("/")) throw new Error(`API paths start with "/": ${path}`);
    const url = new URL(base + path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async function once<T>(url: string, init: RequestInit, opts: RequestOptions): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), opts.timeoutMs ?? timeoutMs);
    const onAbort = () => controller.abort("aborted");
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    let res: Response;
    try {
      res = await doFetch(url, { ...init, signal: controller.signal });
    } catch {
      const reason = controller.signal.aborted ? controller.signal.reason : null;
      if (reason === "timeout") throw new ApiRequestError(0, "timeout", "The server took too long to answer. Check your connection and try again.");
      if (reason === "aborted") throw new ApiRequestError(0, "aborted", "The request was cancelled.");
      throw new ApiRequestError(0, "network_error", "Could not reach the server. Check your connection and try again.");
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }

    const requestId = res.headers.get("x-request-id");
    const text = res.status === 204 || init.method === "HEAD" ? "" : await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new ApiRequestError(res.status, "bad_response", "The server sent a response this app could not read.", [], requestId);
      }
    }
    if (res.ok || opts.acceptStatuses?.includes(res.status)) {
      if (res.status === 204 || init.method === "HEAD") return undefined as T;
      if (isSuccessBody(body)) return body.data as T;
      throw new ApiRequestError(res.status, "bad_response", "The server sent a response this app could not read.", [], requestId);
    }
    if (isErrorBody(body)) {
      const err = new ApiRequestError(res.status, body.error.code, body.error.message, body.error.fields ?? [], body.error.requestId ?? requestId);
      (err as { retryAfterMs?: number }).retryAfterMs = retryAfter(res);
      throw err;
    }
    const err = new ApiRequestError(res.status, RETRY_STATUSES.has(res.status) ? "retry_later" : "bad_response", `The server answered with status ${res.status}.`, [], requestId);
    (err as { retryAfterMs?: number }).retryAfterMs = retryAfter(res);
    throw err;
  }

  function retryAfter(res: Response): number | undefined {
    const value = Number(res.headers.get("retry-after"));
    return Number.isFinite(value) && value >= 0 ? Math.min(value * 1000, MAX_RETRY_AFTER_MS) : undefined;
  }

  /** Call an API path (relative to /api/v1) and return the `data` of the response. */
  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const method = opts.method ?? "GET";
    const headers: Record<string, string> = { Accept: "application/json" };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    const mutating = method !== "GET" && method !== "HEAD";
    if (mutating) headers["Idempotency-Key"] = opts.idempotencyKey ?? randomId();

    const url = urlFor(path, opts.query);
    const init: RequestInit = { method, headers, body, credentials: "omit" };
    const attempts = mutating ? 1 : 1 + retries;
    for (let attempt = 1; ; attempt++) {
      try {
        return await once<T>(url, init, opts);
      } catch (err) {
        const retryable = err instanceof ApiRequestError && err.retryable;
        if (!retryable || attempt >= attempts) throw err;
        const hinted = (err as { retryAfterMs?: number }).retryAfterMs;
        await sleep(hinted ?? retryDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  /** GET /health. Returns the report for both 200 (ok) and 503 (degraded) instead of throwing on 503. */
  function getHealth(opts: Pick<RequestOptions, "signal" | "timeoutMs"> = {}): Promise<HealthReport> {
    return request<HealthReport>("/health", { ...opts, acceptStatuses: [503], method: "GET" });
  }

  return { request, getHealth, baseUrl: base };
}

export type ApiClient = ReturnType<typeof createApiClient>;
