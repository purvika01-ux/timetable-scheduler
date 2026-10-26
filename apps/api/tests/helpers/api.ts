// Shared test helpers: configuration, a silent logger, and HTTP calls against a real server.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { Express } from "express";

import { loadConfig, type Config } from "../../src/config.ts";
import { createLogger } from "../../src/logger.ts";

export const ALLOWED_ORIGIN = "http://localhost:3000";

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: "0",
    MONGODB_URI: "mongodb://127.0.0.1:1/unused",
    CORS_ORIGINS: ALLOWED_ORIGIN,
    LOG_LEVEL: "silent",
    SHUTDOWN_TIMEOUT_MS: "2000",
    DB_SERVER_SELECTION_TIMEOUT_MS: "500",
    ...overrides,
  });
}

export const silentLogger = createLogger({ logLevel: "silent", env: "test" });

/** Serve an Express app on a free port for the duration of a test. */
export async function serve(app: Express): Promise<{ url: string; close: () => Promise<void>; server: Server }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    server,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export interface JsonResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: T;
}

export async function call<T = Record<string, unknown>>(url: string, init: RequestInit = {}): Promise<JsonResponse<T>> {
  const res = await fetch(url, init);
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: (text ? JSON.parse(text) : null) as T };
}
