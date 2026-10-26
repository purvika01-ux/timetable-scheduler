// Multi-document transactions (DATABASE_DESIGN.md section 6): a change and its audit event commit
// together or not at all. Needs a replica set (M18); Mongoose retries transient errors.

import type { ClientSession, Connection } from "mongoose";

export function withTransaction<T>(connection: Connection, fn: (session: ClientSession) => Promise<T>): Promise<T> {
  return connection.transaction(fn, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
}
