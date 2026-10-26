// Process entry point: read configuration, start the API, and shut down cleanly on SIGINT or
// SIGTERM. Run with `npm run dev` (watch mode) or `npm start` after `npm run build`.

import { readFileSync } from "node:fs";

import { ConfigError, loadConfig } from "./config.ts";
import { createLogger } from "./logger.ts";
import { startApi } from "./lifecycle.ts";

function packageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function main() {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`${err.message}\nSee apps/api/.env.example for every setting.`);
      process.exit(1);
    }
    throw err;
  }

  const logger = createLogger(config);
  let api;
  try {
    api = await startApi({ config, logger, version: packageVersion() });
  } catch (err) {
    logger.fatal({ err }, "could not start the API (is the port already in use?)");
    process.exit(1);
  }

  let signals = 0;
  const stop = (signal: NodeJS.Signals) => {
    signals += 1;
    if (signals > 1) {
      logger.warn({ signal }, "second signal: exiting immediately");
      process.exit(1);
    }
    logger.info({ signal }, "shutdown requested");
    api.close().then(
      () => process.exit(0),
      (err) => {
        logger.error({ err }, "shutdown failed");
        process.exit(1);
      },
    );
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  // A crash leaves the process in an unknown state: log it and exit so the host restarts it.
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "unhandled promise rejection");
    process.exit(1);
  });
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "uncaught exception");
    process.exit(1);
  });
}

void main();
