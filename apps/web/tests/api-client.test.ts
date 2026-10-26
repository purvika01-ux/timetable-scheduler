import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiRequestError, apiBaseUrlFromEnv, createApiClient } from "../src/lib/api/client.ts";

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: (Response | Error | ((call: Call) => Response | Promise<Response>))[]) {
  const calls: Call[] = [];
  const fn = async (url: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(url), init };
    calls.push(call);
    const next = responses.shift();
    if (!next) throw new Error("no more fake responses");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(call) : next;
  };
  return { fetch: fn as typeof fetch, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-request-id": "req-12345678", ...headers } });

const noSleep = async () => {};

describe("apiBaseUrlFromEnv", () => {
  it("reads an http(s) origin and ignores paths and junk", () => {
    assert.equal(apiBaseUrlFromEnv({ NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000/" }), "http://localhost:4000");
    assert.equal(apiBaseUrlFromEnv({ NEXT_PUBLIC_API_BASE_URL: "https://api.example.edu/some/path" }), "https://api.example.edu");
    assert.equal(apiBaseUrlFromEnv({ NEXT_PUBLIC_API_BASE_URL: "" }), null);
    assert.equal(apiBaseUrlFromEnv({ NEXT_PUBLIC_API_BASE_URL: "ftp://x" }), null);
    assert.equal(apiBaseUrlFromEnv({ NEXT_PUBLIC_API_BASE_URL: "not a url" }), null);
    assert.equal(apiBaseUrlFromEnv({}), null);
  });
});

describe("createApiClient.request", () => {
  it("calls /api/v1 paths with the query string and returns data", async () => {
    const f = fakeFetch([json(200, { data: { items: [1, 2] }, meta: { requestId: "r" } })]);
    const api = createApiClient({ baseUrl: "http://localhost:4000/", fetch: f.fetch });
    const data = await api.request<{ items: number[] }>("/things", { query: { limit: 2, empty: undefined, q: "a b" } });
    assert.deepEqual(data, { items: [1, 2] });
    assert.equal(f.calls[0].url, "http://localhost:4000/api/v1/things?limit=2&q=a+b");
    assert.equal(f.calls[0].init.method, "GET");
    assert.equal(f.calls[0].init.credentials, "omit");
    assert.equal(new Headers(f.calls[0].init.headers).get("idempotency-key"), null);
  });

  it("sends JSON bodies with an idempotency key on mutating requests", async () => {
    const f = fakeFetch([json(201, { data: { id: "x" }, meta: { requestId: "r" } })]);
    const api = createApiClient({ baseUrl: "http://localhost:4000", fetch: f.fetch, randomId: () => "key-1" });
    await api.request("/things", { method: "POST", body: { name: "Room 101" } });
    const headers = new Headers(f.calls[0].init.headers);
    assert.equal(headers.get("content-type"), "application/json");
    assert.equal(headers.get("idempotency-key"), "key-1");
    assert.equal(f.calls[0].init.body, JSON.stringify({ name: "Room 101" }));
  });

  it("throws the API's error with code, fields and request id", async () => {
    const f = fakeFetch([
      json(400, { error: { code: "validation_failed", message: "Fix the fields.", fields: [{ path: "body.name", code: "too_small", message: "is required" }], requestId: "req-abc12345" } }),
    ]);
    const api = createApiClient({ baseUrl: "http://localhost:4000", fetch: f.fetch });
    await assert.rejects(api.request("/things", { method: "POST", body: {} }), (err: unknown) => {
      assert.ok(err instanceof ApiRequestError);
      assert.equal(err.status, 400);
      assert.equal(err.code, "validation_failed");
      assert.equal(err.message, "Fix the fields.");
      assert.deepEqual(err.fields.map((x) => x.path), ["body.name"]);
      assert.equal(err.requestId, "req-abc12345");
      assert.equal(err.retryable, false);
      return true;
    });
  });

  it("retries GET after a network failure and a 503, honouring Retry-After", async () => {
    const waits: number[] = [];
    const f = fakeFetch([
      new TypeError("fetch failed"),
      json(503, { error: { code: "database_unavailable", message: "Try again.", requestId: "r" } }, { "retry-after": "2" }),
      json(200, { data: "ok", meta: { requestId: "r" } }),
    ]);
    const api = createApiClient({ baseUrl: "http://x.test", fetch: f.fetch, retries: 2, retryDelayMs: 100, sleep: async (ms) => void waits.push(ms) });
    assert.equal(await api.request("/things"), "ok");
    assert.equal(f.calls.length, 3);
    assert.deepEqual(waits, [100, 2000]);
  });

  it("gives up after the configured retries", async () => {
    const f = fakeFetch([new TypeError("x"), new TypeError("x"), new TypeError("x")]);
    const api = createApiClient({ baseUrl: "http://x.test", fetch: f.fetch, retries: 2, sleep: noSleep });
    await assert.rejects(api.request("/things"), (err: unknown) => err instanceof ApiRequestError && err.code === "network_error" && err.status === 0);
    assert.equal(f.calls.length, 3);
  });

  it("never retries a mutating request automatically", async () => {
    const f = fakeFetch([new TypeError("x")]);
    const api = createApiClient({ baseUrl: "http://x.test", fetch: f.fetch, sleep: noSleep });
    await assert.rejects(api.request("/things", { method: "POST", body: {} }), (err: unknown) => err instanceof ApiRequestError && err.code === "network_error");
    assert.equal(f.calls.length, 1);
  });

  it("times out slow requests", async () => {
    const f = fakeFetch([
      ({ init }) =>
        new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    ]);
    const api = createApiClient({ baseUrl: "http://x.test", fetch: f.fetch, retries: 0, timeoutMs: 20 });
    await assert.rejects(api.request("/slow"), (err: unknown) => err instanceof ApiRequestError && err.code === "timeout" && err.retryable);
  });

  it("stops when the caller cancels", async () => {
    const controller = new AbortController();
    const f = fakeFetch([
      ({ init }) =>
        new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    ]);
    const api = createApiClient({ baseUrl: "http://x.test", fetch: f.fetch, retries: 2, sleep: noSleep });
    const pending = api.request("/slow", { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, (err: unknown) => err instanceof ApiRequestError && err.code === "aborted" && !err.retryable);
    assert.equal(f.calls.length, 1);
  });

  it("reports responses it cannot read", async () => {
    const f = fakeFetch([new Response("<html>proxy error</html>", { status: 502 })]);
    const api = createApiClient({ baseUrl: "http://x.test", fetch: f.fetch, retries: 0 });
    await assert.rejects(api.request("/things"), (err: unknown) => err instanceof ApiRequestError && err.code === "bad_response" && err.status === 502);
  });

  it("refuses paths without a leading slash", async () => {
    const api = createApiClient({ baseUrl: "http://x.test", fetch: fakeFetch([]).fetch });
    await assert.rejects(api.request("things"), /start with "\/"/);
  });
});

describe("createApiClient.getHealth", () => {
  const report = {
    status: "degraded",
    api: { status: "up", version: "0.1.0", uptimeSeconds: 3 },
    database: { status: "down", state: "connecting", reason: "connecting" },
    checkedAt: "2026-10-26T10:00:00.000Z",
  };

  it("returns the report when the API answers 503 (degraded), without retrying", async () => {
    const f = fakeFetch([json(503, { data: report, meta: { requestId: "r" } }, { "retry-after": "5" })]);
    const api = createApiClient({ baseUrl: "http://x.test", fetch: f.fetch, sleep: noSleep });
    assert.deepEqual(await api.getHealth(), report);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url, "http://x.test/api/v1/health");
  });

  it("returns the report when healthy", async () => {
    const ok = { ...report, status: "ok", database: { status: "up", state: "connected", latencyMs: 2, schemaReady: true } };
    const f = fakeFetch([json(200, { data: ok, meta: { requestId: "r" } })]);
    const api = createApiClient({ baseUrl: "http://x.test", fetch: f.fetch });
    assert.deepEqual(await api.getHealth(), ok);
  });
});
