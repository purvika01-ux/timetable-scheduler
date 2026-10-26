// Contract test: the frontend's API client (apps/web/src/lib/api/client.ts) against the real API and
// a real database. Until Phase 2 moves the shared types into packages/contracts, this keeps the two
// sides from drifting apart.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Types } from "mongoose";

import { ApiRequestError, createApiClient } from "../../../web/src/lib/api/client.ts";
import { startApi, type RunningApi } from "../../src/lifecycle.ts";
import { silentLogger, testConfig } from "../helpers/api.ts";
import { freePort, startTestMongo, type TestMongo } from "../helpers/mongod.ts";
import { testRoutes } from "../helpers/test-routes.ts";

let mongo: TestMongo;
let api: RunningApi;

before(async () => {
  mongo = await startTestMongo();
  api = await startApi({ config: testConfig({ MONGODB_URI: mongo.uri }), logger: silentLogger, version: "contract", extraModules: (m) => [testRoutes(m)] });
  await api.databaseReady;
});
after(async () => {
  await api?.close();
  await mongo?.stop();
});

describe("frontend API client against the real API", () => {
  it("reads a healthy report", async () => {
    const client = createApiClient({ baseUrl: api.url });
    const health = await client.getHealth();
    assert.equal(health.status, "ok");
    assert.equal(health.api.version, "contract");
    assert.equal(health.database.status, "up");
    assert.equal(health.database.schemaReady, true);
  });

  it("creates and reads data through the response envelope", async () => {
    const client = createApiClient({ baseUrl: api.url });
    const college = new Types.ObjectId().toHexString();
    const created = await client.request<{ id: string; action: string }>(`/test/colleges/${college}/events`, {
      method: "POST",
      body: { action: "contract.check", targetId: "1" },
    });
    assert.equal(created.action, "contract.check");
    const list = await client.request<{ id: string }[]>(`/test/colleges/${college}/events`);
    assert.deepEqual(list.map((e) => e.id), [created.id]);
  });

  it("surfaces validation errors with their fields", async () => {
    const client = createApiClient({ baseUrl: api.url });
    await assert.rejects(client.request("/test/colleges/bad/events", { method: "POST", body: { action: "" } }), (err: unknown) => {
      assert.ok(err instanceof ApiRequestError);
      assert.equal(err.code, "validation_failed");
      assert.ok(err.fields.some((f) => f.path === "params.collegeId"));
      assert.ok(err.requestId);
      return true;
    });
  });

  it("surfaces not-found errors", async () => {
    const client = createApiClient({ baseUrl: api.url });
    await assert.rejects(client.request("/does-not-exist"), (err: unknown) => err instanceof ApiRequestError && err.status === 404 && err.code === "not_found");
  });

  it("reports a degraded API (database down) as a report, not an exception", async () => {
    const port = await freePort();
    const down = await startApi({
      config: testConfig({ MONGODB_URI: `mongodb://127.0.0.1:${port}/x?directConnection=true`, DB_SERVER_SELECTION_TIMEOUT_MS: "300" }),
      logger: silentLogger,
      version: "contract",
      retryDelayMs: 200,
    });
    try {
      const health = await createApiClient({ baseUrl: down.url }).getHealth();
      assert.equal(health.status, "degraded");
      assert.equal(health.database.status, "down");
    } finally {
      await down.close();
    }
  });

  it("reports a stopped API as a network error", async () => {
    const port = await freePort();
    const client = createApiClient({ baseUrl: `http://127.0.0.1:${port}`, retries: 0 });
    await assert.rejects(client.getHealth(), (err: unknown) => err instanceof ApiRequestError && err.code === "network_error");
  });
});
