// Starting and stopping the API. Kept separate from server.ts so tests can start and stop real
// instances; server.ts only adds process signal handling.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { createApp } from "./app.ts";
import { createTokenService } from "./auth/tokens.ts";
import type { Config } from "./config.ts";
import { Database } from "./db/connection.ts";
import { setUpDatabase } from "./db/setup.ts";
import type { Deps } from "./deps.ts";
import type { Logger } from "./logger.ts";
import { createAuthenticator } from "./middleware/auth.ts";
import { registerModels, type Models } from "./models/index.ts";
import { academicRoutes } from "./routes/academic.routes.ts";
import { meRoutes, platformRoutes, registrationRoutes } from "./routes/account.routes.ts";
import { authRoutes } from "./routes/auth.routes.ts";
import { collegeRoutes } from "./routes/colleges.routes.ts";
import { healthModule } from "./routes/health.routes.ts";
import type { ApiModule } from "./routes/module.ts";
import { buildModule, type RouteTableEntry } from "./routes/secure-router.ts";
import { createAcademicService, type AcademicService } from "./services/academic.service.ts";
import { createAuthService, type AuthService } from "./services/auth.service.ts";
import { createCollegeAccessService, type CollegeAccessService } from "./services/college-access.service.ts";
import { createOnboardingService, type OnboardingService } from "./services/college-onboarding.service.ts";
import { createHealthService } from "./services/health.service.ts";
import { createMeService, type MeService } from "./services/me.service.ts";
import { createSessionService, type SessionService } from "./services/session.service.ts";

export interface ApiServices {
  auth: AuthService;
  sessions: SessionService;
  access: CollegeAccessService;
  onboarding: OnboardingService;
  me: MeService;
  academic: AcademicService;
}

export interface RunningApi {
  server: Server;
  db: Database;
  models: Models;
  deps: Deps;
  services: ApiServices;
  routeTable: RouteTableEntry[];
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
  now?: () => Date;
}

export function createCoreDeps(
  config: Config,
  logger: Logger,
  db: Database,
  models: Models,
  now: () => Date = () => new Date(),
): Deps {
  const tokens = createTokenService({
    privateKeyPem: config.auth.privateKeyPem,
    keyId: config.auth.keyId,
    previousPublicKeys: config.auth.previousPublicKeys,
    accessTokenTtlSeconds: config.auth.accessTokenTtlSeconds,
    now,
  });
  return { config, logger, db, models, tokens, now };
}

export function createApiModules(deps: Deps): {
  modules: ApiModule[];
  services: ApiServices;
  routeTable: RouteTableEntry[];
} {
  const authenticator = createAuthenticator(deps, deps.config.env === "test" ? 0 : 60_000);
  const sessionService = createSessionService(deps, {
    onRevoke: (s, u) => authenticator.invalidate(s, u),
  });
  const authService = createAuthService(deps, sessionService);
  const meService = createMeService(deps);
  const collegeAccessService = createCollegeAccessService(deps, authService);
  const onboardingService = createOnboardingService(deps, authService);
  const academicService = createAcademicService(deps);

  const authMod = buildModule(
    deps,
    authenticator,
    authRoutes(deps, {
      auth: authService,
      sessions: sessionService,
      access: collegeAccessService,
      me: meService,
    }),
  );
  const meMod = buildModule(deps, authenticator, meRoutes({ me: meService, auth: authService }));
  const regMod = buildModule(deps, authenticator, registrationRoutes({ onboarding: onboardingService }));
  const platformMod = buildModule(deps, authenticator, platformRoutes({ onboarding: onboardingService }));
  const collegeMod = buildModule(deps, authenticator, collegeRoutes({ access: collegeAccessService }));
  const academicMod = buildModule(deps, authenticator, academicRoutes({ academic: academicService }));

  const modules = [authMod, meMod, regMod, platformMod, collegeMod, academicMod];
  return {
    modules,
    services: {
      auth: authService,
      sessions: sessionService,
      access: collegeAccessService,
      onboarding: onboardingService,
      me: meService,
      academic: academicService,
    },
    routeTable: modules.flatMap((m) => m.table),
  };
}

export async function startApi({ config, logger, version, extraModules, retryDelayMs, now }: StartOptions): Promise<RunningApi> {
  const db = new Database({ uri: config.mongoUri, serverSelectionTimeoutMs: config.dbServerSelectionTimeoutMs, logger, retryDelayMs });
  const models = registerModels(db.connection);
  const deps = createCoreDeps(config, logger, db, models, now);
  const health = createHealthService({ db, version, startedAt: new Date() });
  const { modules: apiModules, services, routeTable } = createApiModules(deps);

  const app = createApp({
    config,
    logger,
    modules: [healthModule(health), ...apiModules, ...(extraModules?.(models) ?? [])],
  });

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

  return { server, db, models, deps, services, routeTable, databaseReady, url, close };
}
