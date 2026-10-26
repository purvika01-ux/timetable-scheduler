// HTTP behaviour of the assembled app, without a database: response formats, validation, error
// handling, body rules, CORS and security headers. A test-only module provides routes to exercise
// the shared middleware; it is never part of the real API.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Router } from "express";
import { z } from "zod";

import { createApp } from "../../src/app.ts";
import { ApiError } from "../../src/http/errors.ts";
import { sendData } from "../../src/http/response.ts";
import { valid, validate } from "../../src/middleware/validate.ts";
import { healthModule } from "../../src/routes/health.routes.ts";
import type { ApiModule } from "../../src/routes/module.ts";
import { createHealthService } from "../../src/services/health.service.ts";
import { ALLOWED_ORIGIN, call, serve, silentLogger, testConfig } from "../helpers/api.ts";

const itemSchemas = {
  params: z.strictObject({ id: z.string().regex(/^[a-f0-9]{24}$/, { error: "must be a 24-character id" }) }),
  query: z.strictObject({ limit: z.coerce.number().int().min(1).max(200).default(50) }),
  body: z.strictObject({ name: z.string().trim().min(1, { error: "is required" }).max(80), seats: z.number().int().min(1) }),
};

function testModule(): ApiModule {
  const router = Router();
  router.post("/items/:id", validate(itemSchemas), (req, res) => {
    const { params, query, body } = valid(req, itemSchemas);
    sendData(res, { id: params.id, limit: query.limit, ...body }, 201);
  });
  router.get("/boom", () => {
    throw new Error("secret internal detail: connection string mongodb://user:pw@host");
  });
  router.get("/conflict", () => {
    throw new ApiError(409, "version_conflict", "Someone else changed this. Reload and try again.");
  });
  router.get("/db-down", () => {
    const err = new Error("connection refused");
    err.name = "MongoServerSelectionError";
    throw err;
  });
  router.get("/async-boom", async () => {
    await Promise.resolve();
    throw new Error("async failure");
  });
  return { path: "/test", router };
}

let dbUp = true;
const fakeDb = {
  get status() {
    return dbUp ? ("connected" as const) : ("disconnected" as const);
  },
  ping: async () => (dbUp ? { status: "up" as const, latencyMs: 3 } : { status: "down" as const, reason: "disconnected" }),
};

let url = "";
let close: () => Promise<void>;

before(async () => {
  const health = createHealthService({ db: fakeDb, version: "9.9.9", startedAt: new Date(Date.now() - 5_000) });
  const app = createApp({ config: testConfig(), logger: silentLogger, modules: [healthModule(health), testModule()] });
  ({ url, close } = await serve(app));
});
after(() => close());

const json = (body: unknown, extra: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", ...extra },
  body: JSON.stringify(body),
});
const ID = "65f1c2a9e4b0a1b2c3d4e5f6";

describe("response format and request ids", () => {
  it("wraps data and returns the request id in the body and header", async () => {
    const res = await call<{ data: { status: string }; meta: { requestId: string } }>(`${url}/api/v1/health/live`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { status: "up" });
    assert.ok(res.body.meta.requestId);
    assert.equal(res.headers.get("x-request-id"), res.body.meta.requestId);
  });

  it("keeps a safe incoming request id and replaces an unsafe one", async () => {
    const kept = await call(`${url}/api/v1/health/live`, { headers: { "x-request-id": "client-abc-123" } });
    assert.equal(kept.headers.get("x-request-id"), "client-abc-123");
    const replaced = await call(`${url}/api/v1/health/live`, { headers: { "x-request-id": "bad id <script>" } });
    assert.notEqual(replaced.headers.get("x-request-id"), "bad id <script>");
  });
});

describe("health", () => {
  it("reports ok with database latency when the database answers", async () => {
    dbUp = true;
    const res = await call<{ data: { status: string; api: { version: string; uptimeSeconds: number }; database: { status: string; latencyMs: number } } }>(
      `${url}/api/v1/health`,
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "ok");
    assert.equal(res.body.data.api.version, "9.9.9");
    assert.ok(res.body.data.api.uptimeSeconds >= 5);
    assert.deepEqual(res.body.data.database, { status: "up", latencyMs: 3, state: "connected" });
    assert.equal(res.headers.get("cache-control"), "no-store");
  });

  it("reports degraded with 503 when the database does not answer", async () => {
    dbUp = false;
    const res = await call<{ data: { status: string; database: { status: string; reason: string } } }>(`${url}/api/v1/health`);
    dbUp = true;
    assert.equal(res.status, 503);
    assert.equal(res.body.data.status, "degraded");
    assert.equal(res.body.data.database.status, "down");
    assert.equal(res.headers.get("retry-after"), "5");
  });
});

describe("validation", () => {
  it("passes parsed params, query and body to the handler", async () => {
    const res = await call<{ data: unknown }>(`${url}/api/v1/test/items/${ID}?limit=10`, json({ name: "  Room 101 ", seats: 60 }));
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.data, { id: ID, limit: 10, name: "Room 101", seats: 60 });
  });

  it("applies query defaults", async () => {
    const res = await call<{ data: { limit: number } }>(`${url}/api/v1/test/items/${ID}`, json({ name: "Lab", seats: 30 }));
    assert.equal(res.body.data.limit, 50);
  });

  it("reports every invalid field across params, query and body", async () => {
    const res = await call<{ error: { code: string; fields: { path: string; message: string }[]; requestId: string } }>(
      `${url}/api/v1/test/items/not-an-id?limit=0`,
      json({ name: "", seats: 1.5 }),
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "validation_failed");
    assert.deepEqual(res.body.error.fields.map((f) => f.path).sort(), ["body.name", "body.seats", "params.id", "query.limit"]);
    assert.equal(res.body.error.fields.find((f) => f.path === "params.id")?.message, "must be a 24-character id");
    assert.ok(res.body.error.requestId);
  });

  it("refuses unknown fields, including MongoDB operators", async () => {
    const res = await call<{ error: { fields: { path: string; code: string }[] } }>(
      `${url}/api/v1/test/items/${ID}`,
      json({ name: "Lab", seats: 30, $where: "1", isAdmin: true }),
    );
    assert.equal(res.status, 400);
    assert.ok(res.body.error.fields.every((f) => f.path === "body" && f.code === "unrecognized_keys"));
  });

  it("refuses unknown query parameters", async () => {
    const res = await call(`${url}/api/v1/test/items/${ID}?limit=5&sort[$gt]=1`, json({ name: "Lab", seats: 30 }));
    assert.equal(res.status, 400);
  });
});

describe("request bodies", () => {
  it("refuses malformed JSON", async () => {
    const res = await call<{ error: { code: string } }>(`${url}/api/v1/test/items/${ID}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"name": "Lab",',
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "bad_request");
  });

  it("refuses bodies over 1 MB", async () => {
    const res = await call<{ error: { code: string } }>(`${url}/api/v1/test/items/${ID}`, json({ name: "x".repeat(1_100_000), seats: 1 }));
    assert.equal(res.status, 413);
    assert.equal(res.body.error.code, "payload_too_large");
  });

  it("refuses non-JSON bodies", async () => {
    const res = await call<{ error: { code: string } }>(`${url}/api/v1/test/items/${ID}`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "name=Lab",
    });
    assert.equal(res.status, 415);
    assert.equal(res.body.error.code, "unsupported_media_type");
  });
});

describe("error handling", () => {
  it("returns 404 in the error format for unknown routes", async () => {
    const res = await call<{ error: { code: string; message: string } }>(`${url}/api/v1/nope`);
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "not_found");
    assert.match(res.body.error.message, /GET \/api\/v1\/nope/);
  });

  it("hides internal details of unexpected errors", async () => {
    for (const path of ["/api/v1/test/boom", "/api/v1/test/async-boom"]) {
      const res = await call<{ error: { code: string; message: string; requestId: string } }>(`${url}${path}`);
      assert.equal(res.status, 500);
      assert.equal(res.body.error.code, "internal");
      assert.doesNotMatch(JSON.stringify(res.body), /secret|mongodb|stack|async failure/);
      assert.ok(res.body.error.requestId);
    }
  });

  it("passes known API errors through", async () => {
    const res = await call<{ error: { code: string; message: string } }>(`${url}/api/v1/test/conflict`);
    assert.equal(res.status, 409);
    assert.deepEqual(res.body.error.code, "version_conflict");
  });

  it("turns database connection failures into 503 with Retry-After", async () => {
    const res = await call<{ error: { code: string } }>(`${url}/api/v1/test/db-down`);
    assert.equal(res.status, 503);
    assert.equal(res.body.error.code, "database_unavailable");
    assert.equal(res.headers.get("retry-after"), "5");
  });
});

describe("CORS and security headers", () => {
  it("allows a listed origin, including preflight", async () => {
    const pre = await fetch(`${url}/api/v1/test/items/${ID}`, {
      method: "OPTIONS",
      headers: { origin: ALLOWED_ORIGIN, "access-control-request-method": "POST", "access-control-request-headers": "content-type,idempotency-key" },
    });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
    assert.match(pre.headers.get("access-control-allow-headers") ?? "", /Idempotency-Key/);
    assert.equal(pre.headers.get("access-control-allow-credentials"), null);
    const res = await fetch(`${url}/api/v1/health/live`, { headers: { origin: ALLOWED_ORIGIN } });
    assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
    assert.match(res.headers.get("access-control-expose-headers") ?? "", /X-Request-Id/);
  });

  it("gives other origins no CORS headers", async () => {
    const res = await fetch(`${url}/api/v1/health/live`, { headers: { origin: "https://evil.example.com" } });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
    const pre = await fetch(`${url}/api/v1/health/live`, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example.com", "access-control-request-method": "GET" },
    });
    assert.equal(pre.headers.get("access-control-allow-origin"), null);
  });

  it("sets security headers and hides the framework", async () => {
    const res = await fetch(`${url}/api/v1/health/live`);
    assert.equal(res.headers.get("x-powered-by"), null);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'none'/);
    assert.match(res.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  });
});
