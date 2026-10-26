// Health report: is the API process up, and can it reach the database right now? The database part
// is measured with a real ping on every request, never assumed.

import type { Database, PingResult } from "../db/connection.ts";

export interface HealthReport {
  /** "ok" only when the database answers and is set up; "degraded" when the API is up but the database is not ready. */
  status: "ok" | "degraded";
  api: { status: "up"; version: string; uptimeSeconds: number };
  database: PingResult & { state: Database["status"] };
  checkedAt: string;
}

export interface HealthServiceDeps {
  db: Pick<Database, "ping" | "status">;
  version: string;
  startedAt: Date;
  now?: () => Date;
  pingTimeoutMs?: number;
}

export function createHealthService(deps: HealthServiceDeps) {
  const now = deps.now ?? (() => new Date());
  return {
    async check(): Promise<HealthReport> {
      const ping = await deps.db.ping(deps.pingTimeoutMs ?? 1_000);
      const at = now();
      return {
        // The database counts as ready only when it answers and its collections and indexes are set up.
        status: ping.status === "up" && ping.schemaReady !== false ? "ok" : "degraded",
        api: { status: "up", version: deps.version, uptimeSeconds: Math.max(0, Math.round((at.getTime() - deps.startedAt.getTime()) / 1000)) },
        database: { ...ping, state: deps.db.status },
        checkedAt: at.toISOString(),
      };
    },
  };
}

export type HealthService = ReturnType<typeof createHealthService>;
