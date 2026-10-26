// Everything services need, created once in lifecycle.ts. Tests build their own with a fixed clock.

import type { TokenService } from "./auth/tokens.ts";
import type { Config } from "./config.ts";
import type { Database } from "./db/connection.ts";
import type { Logger } from "./logger.ts";
import type { Models } from "./models/index.ts";

export interface Deps {
  config: Config;
  logger: Logger;
  db: Database;
  models: Models;
  tokens: TokenService;
  now: () => Date;
}
