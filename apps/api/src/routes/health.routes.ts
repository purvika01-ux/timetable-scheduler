import { Router } from "express";

import { healthController } from "../controllers/health.controller.ts";
import type { HealthService } from "../services/health.service.ts";
import type { ApiModule } from "./module.ts";

/** Public: health checks carry no college data and need no sign-in (API_DESIGN.md section 4.1). */
export function healthModule(service: HealthService): ApiModule {
  const controller = healthController(service);
  const router = Router();
  router.get("/", controller.health);
  router.get("/live", controller.live);
  return { path: "/health", router };
}
