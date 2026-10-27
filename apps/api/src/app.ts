// Express application assembly. Middleware order follows ARCHITECTURE.md section 4: request id,
// logging, security headers, CORS, body rules, routes, 404, errors. Authentication, tenant context
// and route policies are added with sign-in in Phase 5.

import express, { type Express } from "express";

import type { Config } from "./config.ts";
import type { Logger } from "./logger.ts";
import { errorHandler, notFoundHandler } from "./middleware/errors.ts";
import { requestId } from "./middleware/request-id.ts";
import { requestLogger } from "./middleware/request-logger.ts";
import { corsPolicy, requireJsonBody, securityHeaders } from "./middleware/security.ts";
import type { ApiModule } from "./routes/module.ts";
import { REFRESH_COOKIE_PATH } from "./services/session.service.ts";

export const API_PREFIX = "/api/v1";
export const JSON_BODY_LIMIT = "1mb";

export interface AppDeps {
  config: Pick<Config, "corsOrigins" | "trustProxy">;
  logger: Logger;
  modules: ApiModule[];
}

export function createApp({ config, logger, modules }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  // Simple query parsing: no nested objects, so query values cannot smuggle operators.
  app.set("query parser", "simple");

  app.use(requestId);
  app.use(requestLogger(logger));
  app.use(securityHeaders);
  app.use(corsPolicy(config.corsOrigins, REFRESH_COOKIE_PATH));
  app.use(requireJsonBody);
  app.use(express.json({ limit: JSON_BODY_LIMIT, strict: true }));

  const v1 = express.Router();
  for (const module of modules) v1.use(module.path, module.router);
  app.use(API_PREFIX, v1);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
