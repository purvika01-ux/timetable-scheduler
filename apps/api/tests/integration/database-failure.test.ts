// Database failures, with real servers: unreachable from the start, coming up after the API, and
// disappearing while the API runs. Health must report the truth and requests must fail with a clear
// 503 instead of hanging.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Types } from "mongoose";

import { startApi } from "../../src/lifecycle.ts";
import { call, silentLogger, testConfig } from "../helpers/api.ts";
import { freePort, startTestMongo } from "../helpers/mongod.ts";
import { testRoutes } from "../helpers/test-routes.ts";

type Health = { data: { status: string; database: { status: string; reason?: string; state: string } } };
const college = new Types.ObjectId().toHexString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return true;
    await sleep(200);
  }
  return false;
}

describe("database unreachable at startup", () => {
  it("starts anyway, reports degraded health, and answers data requests with 503", async () => {
    const port = await freePort(); // nothing listens here
    const api = await startApi({
      config: testConfig({ MONGODB_URI: `mongodb://127.0.0.1:${port}/cto_test?directConnection=true`, DB_SERVER_SELECTION_TIMEOUT_MS: "300" }),
      logger: silentLogger,
      version: "test",
      extraModules: (models) => [testRoutes(models)],
      retryDelayMs: 200,
    });
    try {
      const live = await call(`${api.url}/api/v1/health/live`);
      assert.equal(live.status, 200);

      const health = await call<Health>(`${api.url}/api/v1/health`);
      assert.equal(health.status, 503);
      assert.equal(health.body.data.status, "degraded");
      assert.equal(health.body.data.database.status, "down");

      const started = Date.now();
      const data = await call<{ error: { code: string; message: string } }>(`${api.url}/api/v1/test/colleges/${college}/events`);
      assert.equal(data.status, 503);
      assert.equal(data.body.error.code, "database_unavailable");
      assert.ok(Date.now() - started < 2_000, "fails fast instead of waiting for the database");
    } finally {
      await api.close();
    }
  });
});

describe("database comes up after the API", () => {
  it("keeps retrying, then connects, creates indexes and reports ok", async () => {
    const port = await freePort();
    const api = await startApi({
      config: testConfig({ MONGODB_URI: `mongodb://127.0.0.1:${port}/cto_test?directConnection=true`, DB_SERVER_SELECTION_TIMEOUT_MS: "300" }),
      logger: silentLogger,
      version: "test",
      retryDelayMs: 200,
    });
    const mongo = await startTestMongo(port);
    try {
      await api.databaseReady;
      const health = await call<Health>(`${api.url}/api/v1/health`);
      assert.equal(health.status, 200);
      assert.equal(health.body.data.database.status, "up");
      const indexes = await api.db.connection.db!.collection("memberships").indexes();
      assert.ok(indexes.some((i) => i.name === "college_user_unique"));
    } finally {
      await api.close();
      await mongo.stop();
    }
  });
});

describe("database goes away while the API runs", () => {
  it("reports degraded and fails requests with 503", async () => {
    const mongo = await startTestMongo();
    const api = await startApi({
      config: testConfig({ MONGODB_URI: mongo.uri, DB_SERVER_SELECTION_TIMEOUT_MS: "500" }),
      logger: silentLogger,
      version: "test",
      extraModules: (models) => [testRoutes(models)],
    });
    try {
      await api.databaseReady;
      assert.equal((await call<Health>(`${api.url}/api/v1/health`)).status, 200);

      await mongo.stop();

      const degraded = await waitFor(async () => (await call<Health>(`${api.url}/api/v1/health`)).status === 503, 15_000);
      assert.ok(degraded, "health reports the database as down");
      const health = await call<Health>(`${api.url}/api/v1/health`);
      assert.equal(health.body.data.database.status, "down");

      const data = await call<{ error: { code: string } }>(`${api.url}/api/v1/test/colleges/${college}/events`);
      assert.equal(data.status, 503);
      assert.equal(data.body.error.code, "database_unavailable");
    } finally {
      await api.close();
    }
  });
});
