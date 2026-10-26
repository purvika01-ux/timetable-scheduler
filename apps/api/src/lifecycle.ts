// Starting and stopping the API. Kept separate from server.ts so tests can start and stop real
// instances; server.ts only adds process signal handling.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { createApp } from "./app.ts";
import type { Config } from "./config.ts";
import { Database } from "./db/connection.ts";
import { setUpDatabase } from "./db/setup.ts";
import type { Logger } from "./logger.ts";
import { registerModels, type Models } from "./models/index.ts";
import { healthModule } from "./routes/health.routes.ts";
import type { ApiModule } from "./routes/module.ts";
import { createHealthService } from "./services/health.service.ts";

export interface RunningApi {
  server: Server;
  db: Database;
  models: Models;
  /** Resolves once the first database connection and index setup finished (or the API stopped first). */
  databaseReady: Promise<void>;
  url: string;
  /** Stop accepting requests, let open ones finish (up to the shutdown timeout), then close the database. */
  close: () => Promise<void>;
}

export interface StartOptions {
  config: Config;
  logger: Logger;
  version: string;
  /** Extra modules (used by tests to exercise validation and error handling). */
  extraModules?: (models: Models) => ApiModule[];
  retryDelayMs?: number;
}

export async function startApi({ config, logger, version, extraModules, retryDelayMs }: StartOptions): Promise<RunningApi> {
  const db = new Database({ uri: config.mongoUri, serverSelectionTimeoutMs: config.dbServerSelectionTimeoutMs, logger, retryDelayMs });
  const models = registerModels(db.connection);
  const health = createHealthService({ db, version, startedAt: new Date() });
  const app = createApp({ config, logger, modules: [healthModule(health), ...(extraModules?.(models) ?? [])] });

  const server = createServer(app);
  // Do not let slow or idle clients hold the process open.
  server.requestTimeout = 30_000;
  server.headersTimeout = 20_000;
  server.keepAliveTimeout = 5_000;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  const url = `http://${address.address.includes(":") ? `[${address.address}]` : address.address}:${address.port}`;
  logger.info({ url }, "API listening");

  // The API serves health checks (reporting the database as down) while it keeps trying to connect.
  const databaseReady = db.connectWithRetry(async () => {
    await setUpDatabase(models, logger);
  });

  let closing: Promise<void> | null = null;
  const close = () => {
    closing ??= (async () => {
      logger.info("shutting down: no new connections");
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeIdleConnections();
      let timer: NodeJS.Timeout | undefined;
      const timedOut = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), config.shutdownTimeoutMs);
      });
      if ((await Promise.race([closed, timedOut])) === "timeout") {
        logger.warn({ afterMs: config.shutdownTimeoutMs }, "shutdown timeout reached: closing remaining connections");
        server.closeAllConnections();
        await closed;
      }
      clearTimeout(timer);
      await db.close();
      logger.info("shutdown complete");
    })();
    return closing;
  };

  return { server, db, models, databaseReady, url, close };
}
