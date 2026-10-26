import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ConfigError, loadConfig } from "../../src/config.ts";

const base = { MONGODB_URI: "mongodb://127.0.0.1:27017/timetable_dev" };

describe("loadConfig", () => {
  it("applies safe defaults for development", () => {
    const c = loadConfig(base);
    assert.equal(c.env, "development");
    assert.equal(c.host, "127.0.0.1");
    assert.equal(c.port, 4000);
    assert.deepEqual(c.corsOrigins, []);
    assert.equal(c.logLevel, "info");
    assert.equal(c.shutdownTimeoutMs, 10_000);
  });

  it("parses a list of exact origins", () => {
    const c = loadConfig({ ...base, CORS_ORIGINS: "http://localhost:3000, https://app.example.edu" });
    assert.deepEqual(c.corsOrigins, ["http://localhost:3000", "https://app.example.edu"]);
  });

  for (const [name, env, problem] of [
    ["a missing database URI", {}, /MONGODB_URI is required/],
    ["a non-MongoDB URI", { MONGODB_URI: "postgres://x" }, /MONGODB_URI must start with mongodb:\/\//],
    ["an origin with a path", { ...base, CORS_ORIGINS: "https://app.example.edu/" }, /CORS_ORIGINS.*exact origin/],
    ["a wildcard origin", { ...base, CORS_ORIGINS: "*" }, /CORS_ORIGINS.*exact origin/],
    ["a port out of range", { ...base, PORT: "70000" }, /PORT/],
    ["an unknown log level", { ...base, LOG_LEVEL: "loud" }, /LOG_LEVEL/],
    ["production without CORS origins", { ...base, NODE_ENV: "production" }, /CORS_ORIGINS must list at least one origin in production/],
  ] as const) {
    it(`refuses ${name}`, () => {
      assert.throws(() => loadConfig(env), (err: unknown) => err instanceof ConfigError && problem.test(err.message));
    });
  }

  it("never puts a secret value into the error message", () => {
    const secret = "mongodb+srv://admin:S3cretPassw0rd@cluster.example.net/db";
    assert.throws(
      () => loadConfig({ MONGODB_URI: secret, PORT: "not-a-port" }),
      (err: unknown) => err instanceof ConfigError && !err.message.includes("S3cretPassw0rd") && /PORT/.test(err.message),
    );
  });
});
