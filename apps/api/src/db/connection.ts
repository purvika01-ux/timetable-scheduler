// MongoDB connection handling (ARCHITECTURE.md section 6). One dedicated Mongoose connection per
// process, created explicitly so tests can run isolated instances.
//
// Behaviour:
// - Commands fail immediately while disconnected (bufferCommands off), so requests return a clear
//   503 instead of hanging.
// - The first connection is retried with backoff until it succeeds or the process stops, so the API
//   can start (and report itself as degraded) while the database is still coming up.
// - Once connected, the driver reconnects by itself after network blips.

import mongoose, { type Connection } from "mongoose";

import type { Logger } from "../logger.ts";

// Request values are never used as query operators (SECURITY_MODEL.md section 5).
mongoose.set("sanitizeFilter", true);
mongoose.set("strictQuery", "throw");
// Fail immediately while disconnected instead of queueing commands for 10 seconds. Set globally:
// models do not honour the per-connection setting.
mongoose.set("bufferCommands", false);

export type DatabaseStatus = "connected" | "connecting" | "disconnected" | "disconnecting";

export interface PingResult {
  status: "up" | "down";
  /** Collections and indexes have been set up since this process connected. */
  schemaReady?: boolean;
  latencyMs?: number;
  /** Short, non-sensitive reason when down. */
  reason?: string;
}

const READY_STATES: Record<number, DatabaseStatus> = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };

export interface DatabaseOptions {
  uri: string;
  serverSelectionTimeoutMs: number;
  logger: Logger;
  /** Delay before retrying a failed first connection; doubles up to maxRetryDelayMs. */
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
}

export class Database {
  readonly connection: Connection;
  private readonly options: Required<DatabaseOptions>;
  private stopped = false;
  private retryTimer: NodeJS.Timeout | null = null;
  /** True once the startup setup (collections and indexes) has succeeded. */
  schemaReady = false;

  constructor(options: DatabaseOptions) {
    this.options = { retryDelayMs: 1_000, maxRetryDelayMs: 30_000, ...options };
    this.connection = mongoose.createConnection();
    this.connection.set("bufferCommands", false);
    this.connection.set("autoIndex", false);
    this.connection.set("autoCreate", false);
    this.connection.on("disconnected", () => {
      if (!this.stopped) this.options.logger.warn("database disconnected");
    });
    this.connection.on("reconnected", () => this.options.logger.info("database reconnected"));
  }

  get status(): DatabaseStatus {
    return READY_STATES[this.connection.readyState] ?? "disconnected";
  }

  /** Try to connect once. Resolves true on success, false on failure (logged, never thrown). */
  async connectOnce(): Promise<boolean> {
    try {
      await this.connection.openUri(this.options.uri, {
        serverSelectionTimeoutMS: this.options.serverSelectionTimeoutMs,
        appName: "timetable-api",
      });
      this.options.logger.info({ database: this.connection.name }, "database connected");
      return true;
    } catch (err) {
      this.options.logger.error({ err: describe(err) }, "database connection failed");
      return false;
    }
  }

  /**
   * Connect and run `setup` (collections and indexes), retrying either step with backoff until both
   * succeed or `close()` is called. A server can accept connections before it accepts writes (for
   * example a replica set still electing a primary), so a failed setup is retried, not ignored.
   */
  connectWithRetry(setup?: () => Promise<void>): Promise<void> {
    return new Promise((resolve) => {
      let delay = this.options.retryDelayMs;
      const attempt = async () => {
        if (this.stopped) return resolve();
        const connected = this.connection.readyState === 1 || (await this.connectOnce());
        if (connected) {
          try {
            if (setup) await setup();
            this.schemaReady = true;
            return resolve();
          } catch (err) {
            this.options.logger.error({ err: describe(err) }, "database setup failed");
          }
        }
        if (this.stopped) return resolve();
        this.options.logger.info({ retryInMs: delay }, "retrying database connection and setup");
        this.retryTimer = setTimeout(attempt, delay);
        delay = Math.min(delay * 2, this.options.maxRetryDelayMs);
      };
      void attempt();
    });
  }

  /** Ask the server to answer within `timeoutMs`. Never throws. */
  async ping(timeoutMs = 1_000): Promise<PingResult> {
    if (this.connection.readyState !== 1 || !this.connection.db) return { status: "down", reason: this.status };
    const started = performance.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.connection.db.admin().command({ ping: 1 }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("ping timed out")), timeoutMs);
        }),
      ]);
      return { status: "up", latencyMs: Math.round(performance.now() - started), schemaReady: this.schemaReady };
    } catch (err) {
      return { status: "down", reason: err instanceof Error && err.message === "ping timed out" ? "ping timed out" : "ping failed" };
    } finally {
      clearTimeout(timer);
    }
  }

  async close(): Promise<void> {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    await this.connection.close();
  }
}

/** Errors that mean "the database cannot be reached", as opposed to a bad query. */
export function isDatabaseUnavailableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const names = new Set([
    "MongooseServerSelectionError",
    "MongoServerSelectionError",
    "MongoNetworkError",
    "MongoNetworkTimeoutError",
    "MongoNotConnectedError",
    "MongoTopologyClosedError",
  ]);
  if (names.has(err.name)) return true;
  // Raised by Mongoose when bufferCommands is off and the connection is not open.
  return err.name === "MongooseError" && /before initial connection|connection .*closed|not connected/i.test(err.message);
}

/** Log-safe summary of an error: no connection strings, which can contain credentials. */
export function describe(err: unknown): { name: string; message: string } {
  if (!(err instanceof Error)) return { name: "Error", message: String(err) };
  return { name: err.name, message: err.message.replace(/mongodb(\+srv)?:\/\/[^\s]+/g, "mongodb://[redacted]") };
}
