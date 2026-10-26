// Starts a throwaway MongoDB server for integration tests: the locally installed `mongod`, as a
// single-member replica set (so transactions will work in later phases), on a free port with a
// temporary data folder. It never touches the developer's own MongoDB service or data.
//
// Finds mongod via MONGOD_PATH, then PATH, then the default Windows install folder.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import mongoose from "mongoose";

export interface TestMongo {
  uri: string;
  port: number;
  stop: () => Promise<void>;
}

export function findMongod(): string | null {
  if (process.env.MONGOD_PATH && existsSync(process.env.MONGOD_PATH)) return process.env.MONGOD_PATH;
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["mongod"], { encoding: "utf8" });
  const fromPath = which.status === 0 ? which.stdout.split(/\r?\n/).find(Boolean) : undefined;
  if (fromPath) return fromPath.trim();
  const root = "C:\\Program Files\\MongoDB\\Server";
  if (process.platform === "win32" && existsSync(root)) {
    for (const version of readdirSync(root).sort().reverse()) {
      const candidate = join(root, version, "bin", "mongod.exe");
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Start mongod on `port` (a free one if omitted) and wait until it is a writable primary. */
export async function startTestMongo(port?: number): Promise<TestMongo> {
  const binary = findMongod();
  if (!binary) throw new Error("mongod not found: install MongoDB Community Server or set MONGOD_PATH to run integration tests");
  const actualPort = port ?? (await freePort());
  const dbPath = mkdtempSync(join(tmpdir(), "cto-mongo-"));
  const child: ChildProcess = spawn(
    binary,
    ["--port", String(actualPort), "--bind_ip", "127.0.0.1", "--dbpath", dbPath, "--replSet", "rs0", "--quiet", "--setParameter", "diagnosticDataCollectionEnabled=false"],
    { stdio: "ignore" },
  );
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });

  const direct = `mongodb://127.0.0.1:${actualPort}/?directConnection=true`;
  const deadline = Date.now() + 30_000;
  let initiated = false;
  while (true) {
    if (exited) throw new Error("mongod exited during startup");
    if (Date.now() > deadline) {
      child.kill();
      throw new Error("mongod did not become ready within 30 seconds");
    }
    const conn = mongoose.createConnection();
    try {
      await conn.openUri(direct, { serverSelectionTimeoutMS: 1_000 });
      const admin = conn.db!.admin();
      if (!initiated) {
        await admin.command({ replSetInitiate: { _id: "rs0", members: [{ _id: 0, host: `127.0.0.1:${actualPort}` }] } }).catch((err: { codeName?: string }) => {
          if (err.codeName !== "AlreadyInitialized") throw err;
        });
        initiated = true;
      }
      const hello = await admin.command({ hello: 1 });
      if (hello.isWritablePrimary) {
        await conn.close();
        break;
      }
    } catch {
      // Not ready yet.
    }
    await conn.close().catch(() => undefined);
    await sleep(250);
  }

  const stop = async () => {
    if (!exited) {
      child.kill();
      const until = Date.now() + 15_000;
      while (!exited && Date.now() < until) await sleep(100);
    }
    // Windows may hold file locks briefly after exit.
    for (let i = 0; i < 20; i++) {
      try {
        rmSync(dbPath, { recursive: true, force: true });
        break;
      } catch {
        await sleep(250);
      }
    }
  };

  return { uri: `mongodb://127.0.0.1:${actualPort}/cto_test?directConnection=true`, port: actualPort, stop };
}
